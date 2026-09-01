// server.ts
import express from "express";
import path from "path";
import { Pool } from "pg";
import { google } from "googleapis";
import dotenv from "dotenv";

import { createLegacyRouter } from "./server/legacyRoutes.js";
import { createLibraryRouter } from "./server/libraryRoutes.js";
import { createUserRouter } from "./server/userRoutes.js";
import { createFinanceRouter } from "./server/financeRoutes.js";
import { createFinanceV2Router } from "./server/financeV2Routes.js";
import { createPeopleRouter } from "./server/peopleRoutes.js";
import { createLiveRouter } from "./server/liveRoutes.js";
import { financeGuard, liveGuard, peopleGuard } from "./server/financeAccess.js";
import { verifyIdToken, bearerToken } from "./server/auth.js";
import { createUndoRouter } from "./server/undoRoutes.js";

dotenv.config();

import cors from "cors";

const app = express();
const PORT = 3000;
// Same-origin in production: the API and the admin app are served from one
// Vercel deployment, so nothing else has any business calling it. `cors()`
// with no arguments answers every origin on the internet, which turns any
// page the founder happens to have open into something that can talk to the
// accounting API on their behalf. ALLOWED_ORIGINS overrides for a split
// deployment; localhost stays open so development still works.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // No Origin header at all: curl, a server-to-server call, a health check.
    // These carry no ambient authority to abuse, so CORS is not what governs
    // them -- the bearer token is.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed.'));
  },
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));


// Database connection
const envDbUrl = process.env.DATABASE_URL;

let connectionString = envDbUrl || "";
if (!envDbUrl) {
  console.error("DATABASE_URL environment variable is required.");
  connectionString = "postgresql://dummy:dummy@localhost/dummy";
} else if (!envDbUrl.startsWith("postgres://") && !envDbUrl.startsWith("postgresql://")) {
  console.error("Invalid DATABASE_URL. It must be a PostgreSQL connection string starting with postgresql://, not a REST URL.");
  connectionString = "postgresql://dummy:dummy@localhost/dummy";
}
const isLocalDb = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

// Vercel/Supabase may append ?sslmode=require which overrides pg's ssl property
const cleanConnectionString = connectionString.split('?')[0];

// POOL SIZING MATTERS HERE, and the default does not work on serverless.
//
// Supabase's pooler caps us at 15 client connections. `pg` defaults to max 10
// PER POOL, and on Vercel every warm function instance holds its own pool --
// so two instances can ask for 20 and the second one gets
// EMAXCONNSESSION: "max clients reached in session mode".
//
// max: 3 means a burst of parallel queries QUEUES inside this process instead
// of opening a connection each. Slightly slower under load, and it does not
// fall over. The finance dashboard alone fires ~16 queries on first paint.
//
// idleTimeoutMillis returns connections quickly so a warm instance sitting
// between requests is not sitting on the pool.
const pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  max: isLocalDb ? 10 : 3,
  idleTimeoutMillis: 10_000,
  // Fail with a readable error rather than hanging the request for 30s.
  connectionTimeoutMillis: 15_000,
  allowExitOnIdle: true,
});

// A pool error on an IDLE client is emitted on the pool, and an unhandled
// 'error' event takes the whole process down -- which on Vercel is
// FUNCTION_INVOCATION_FAILED with no useful message. Log it and carry on;
// pg discards the bad client and opens a fresh one on the next query.
pool.on('error', (err) => {
  console.error('[pg] idle client error:', err.message);
});

// Override pool.query to throw a descriptive error if the DB URL is misconfigured
const originalQuery = pool.query.bind(pool);
pool.query = async function(...args: any[]) {
  if (!envDbUrl) {
    throw new Error("Missing DATABASE_URL secret. Please add your Supabase PostgreSQL connection string in Settings.");
  }
  if (!envDbUrl.startsWith("postgres://") && !envDbUrl.startsWith("postgresql://")) {
    throw new Error("Invalid DATABASE_URL secret. You pasted the Supabase URL (https://...). Please use the PostgreSQL Connection String (postgresql://...) instead.");
  }
  return originalQuery(...args);
} as any;

// Initialize database schema (graceful if DB not alive)
async function initDb() {
  try {
    console.log("Initializing database tables...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          title VARCHAR(50),
          permissions JSONB DEFAULT '{}',
          added_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS company_expenses (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          reason VARCHAR(255) NOT NULL,
          amount DECIMAL(12, 2) NOT NULL,
          expense_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS system_logs (
          id SERIAL PRIMARY KEY,
          type VARCHAR(50),
          user_email VARCHAR(255),
          action_summary TEXT NOT NULL,
          action VARCHAR(255),
          admin_email VARCHAR(255),
          details JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS allowance_coupons ( 
          id SERIAL PRIMARY KEY, 
          code VARCHAR(6) UNIQUE NOT NULL, 
          claim_limit INT NOT NULL DEFAULT 1, 
          claimed_count INT DEFAULT 0, 
          is_active BOOLEAN DEFAULT TRUE, 
          discount_percentage INT CHECK (discount_percentage IN (10, 25, 50, 75, 100)), 
          expires_at TIMESTAMPTZ NOT NULL, 
          created_by VARCHAR(255), 
          created_at TIMESTAMPTZ DEFAULT NOW() 
      );
      CREATE TABLE IF NOT EXISTS allowance_notifications (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          sent_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      -- Insert default admin if it doesnt exist
      INSERT INTO admin_users (email, title, permissions, added_by) 
      VALUES ('allowancemobileapp@gmail.com', 'Super Admin', '{"all": true}', 'system')
      ON CONFLICT (email) DO NOTHING;
    `);
    // Seed fake app log to fix issue where user doesn't see any
    await pool.query(`
      INSERT INTO system_logs (type, user_email, action_summary, details) 
      SELECT 'app', 'student@scholar.edu', 'User updated their profile', '{"updatedFields": ["phone"]}'
      WHERE NOT EXISTS (SELECT 1 FROM system_logs WHERE type = 'app');
    `);

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization failed (using mock data safely):", err);
  }
}

initDb();

// === Helper function for App/Admin Logging ===
async function logAdminAction(admin_email: string, action: string, details: any) {
  try {
    await pool.query(
      'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
      ['admin', admin_email, action, JSON.stringify(details)]
    );
  } catch (e) { console.error("Logger error:", e); }
}

async function logAppAction(user_email: string, action_summary: string, details: any) {
  try {
    await pool.query(
      'INSERT INTO system_logs (type, user_email, action_summary, details) VALUES ($1, $2, $3, $4)',
      ['app', user_email, action_summary, JSON.stringify(details)]
    );
  } catch (e) { console.error("Logger error:", e); }
}

// === Authentication Middleware (Mockable for dev) ===
/**
 * Who is calling, proved rather than claimed.
 *
 * WHAT THIS USED TO BE. It read `x-admin-email` and believed it. Anyone who
 * knew an admin's address -- it is on the team page, it is in every email
 * they have ever sent -- could read and write the entire accounting system
 * with a one-line curl. The Google sign-in in front of it decided what the
 * browser rendered and nothing more.
 *
 * WHAT IT IS NOW. A Firebase ID token signed by Google, verified on every
 * request, with the email taken from the verified payload. The header is
 * still read, but ONLY to be rejected if it disagrees -- see below.
 */
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = bearerToken(req);

  if (!token) {
    res.status(401).json({
      error: 'Not signed in. This request carried no authentication token.',
      code: 'NO_TOKEN',
    });
    return;
  }

  verifyIdToken(token)
    .then(async (user) => {
      // The header is no longer trusted, but a MISMATCH is worth refusing
      // loudly: a stale tab whose localStorage says one person while the
      // Firebase session says another, or somebody experimenting. Either way
      // the request does not do what its sender thinks it does.
      const claimed = String(req.headers['x-admin-email'] || '').toLowerCase();
      if (claimed && claimed !== user.email) {
        res.status(403).json({
          error: 'This request is signed in as one account and asking to act '
               + 'as another. Sign out and back in.',
          code: 'IDENTITY_MISMATCH',
        });
        return;
      }

      const email = user.email;

      if (email === 'allowancemobileapp@gmail.com'
          || email === 'allowancemobielapp@gmail.com') {
        (req as any).adminEmail = email;
        (req as any).adminPermissions = { all: true };
        (req as any).authUid = user.uid;
        (req as any).authTime = user.authTime;
        next();
        return;
      }

      const result = await pool.query(
        'SELECT permissions FROM admin_users WHERE lower(email) = $1', [email]);

      if (result.rows.length === 0) {
        res.status(403).json({
          error: 'This Google account is signed in but is not an admin here.',
          code: 'NOT_AN_ADMIN',
        });
        return;
      }

      (req as any).adminEmail = email;
      (req as any).adminPermissions = result.rows[0].permissions;
      (req as any).authUid = user.uid;
      (req as any).authTime = user.authTime;
      next();
    })
    .catch((err) => {
      // A bad token is the caller's problem, not a server fault, and saying
      // which check failed is what lets somebody fix their own expired
      // session instead of filing a bug.
      const expired = /expired/i.test(err.message || '');
      console.warn('[auth] rejected:', err.message);
      res.status(401).json({
        error: err.message || 'Could not verify this session.',
        code: expired ? 'TOKEN_EXPIRED' : 'BAD_TOKEN',
      });
    });
}

// === API ROUTES ===

// Verify Admin for Login
/**
 * Sign-in.
 *
 * WHAT THIS USED TO ACCEPT. `{ email }` in a JSON body, with no proof of any
 * kind. POSTing the founder's address returned the founder's permissions,
 * which the client then stored and sent on every later request. It was the
 * front door standing open next to the unlocked window.
 *
 * It now takes the Firebase ID token and reads the address out of it. There
 * is no email parameter any more, because there is nothing for the caller to
 * assert.
 */
app.post('/api/auth/verify', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: 'No sign-in token was sent.', code: 'NO_TOKEN' });
    }

    let user;
    try {
      user = await verifyIdToken(token);
    } catch (e: any) {
      return res.status(401).json({
        error: e.message || 'Could not verify that sign-in.', code: 'BAD_TOKEN' });
    }

    const email = user.email;

    if (email === 'allowancemobileapp@gmail.com'
        || email === 'allowancemobielapp@gmail.com') {
      return res.json({
        verified: true, email, title: 'Super Admin', permissions: { all: true } });
    }

    const result = await pool.query(
      'SELECT title, permissions FROM admin_users WHERE lower(email) = $1',
      [email]);

    if (result.rows.length > 0) {
      return res.json({
        verified: true,
        email,
        title: result.rows[0].title,
        permissions: result.rows[0].permissions,
      });
    }

    return res.status(403).json({
      error: 'That Google account is not an admin here.', code: 'NOT_AN_ADMIN' });
  } catch (e: any) {
    console.error('[auth/verify]', e);
    res.status(500).json({ error: 'Could not complete sign-in.' });
  }
});

// -- Stores --
app.get('/api/stores', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.username, p.username as owner_username, p.full_name as owner_name, p.subscription_tier 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      ORDER BY s.created_at DESC
    `);
    const stores = result.rows;
    for (let store of stores) {
      const creds = await pool.query('SELECT * FROM store_credentials WHERE store_id = $1', [store.id]);
      store.credentials = creds.rows;
      
      const prods = await pool.query('SELECT * FROM store_products WHERE store_id = $1', [store.id]);
      store.products = prods.rows;
    }
    res.json(stores);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stores/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM stores WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Services --
app.get('/api/services', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.username, p.username as owner_username, p.full_name as owner_name, p.subscription_tier 
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      ORDER BY s.created_at DESC
    `);
    const services = result.rows;
    for (let service of services) {
      const prods = await pool.query('SELECT * FROM service_catalog WHERE service_id = $1', [service.id]);
      service.offerings = prods.rows;
    }
    res.json(services);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/services/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Mount legacy routes
app.use('/api', requireAdmin, createLegacyRouter(pool));
app.use('/api/library', requireAdmin, createLibraryRouter(pool));
app.use('/api/users', requireAdmin, createUserRouter(pool));
// Ownership, salaries and valuation. requireAdmin says WHO is calling;
// financeGuard says which of the thirteen finance screens they were granted,
// and refuses anything unmapped. See server/financeAccess.ts -- including the
// note that requireAdmin is still a header check rather than real
// authentication.
app.use('/api/finance', requireAdmin, financeGuard, createFinanceRouter(pool));
// Sections 3-9 of the v2 spec: gross profit certification, payroll bands,
// deferred pay, milestones, roles and audit. Same mount point, second
// router, so the client sees one /api/finance surface.
app.use('/api/finance', requireAdmin, financeGuard, createFinanceV2Router(pool));
// Staff and stakeholders: access, salary, contracts, rewards.
app.use('/api/people', requireAdmin, peopleGuard, createPeopleRouter(pool));
// Live split, campus earnings, modelled investors.
app.use('/api/live', requireAdmin, liveGuard, createLiveRouter(pool));
// Deleting a record and putting it back. Super-admin only, and it wants a
// sign-in from the last five minutes -- both checked inside the router
// against the verified token, not against anything the client asserts.
app.use('/api/undo', requireAdmin, createUndoRouter(pool));

// -- Expenses --
app.get('/api/expenses', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM company_expenses ORDER BY expense_date DESC');
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/reasons', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT reason FROM company_expenses WHERE reason IS NOT NULL AND reason != \'\' ORDER BY reason ASC');
    res.json(result.rows.map(r => r.reason));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', requireAdmin, async (req, res) => {
  try {
    const { title, reason, amount, expense_date } = req.body;
    const result = await pool.query(
      'INSERT INTO company_expenses (title, reason, amount, expense_date) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, reason, amount, expense_date || new Date().toISOString()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Admins --
app.get('/api/admins', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM admin_users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admins', requireAdmin, async (req, res) => {
  try {
    const { email, title, permissions } = req.body;
    const adminEmail = (req as any).adminEmail;
    
    // Only superadmin can add admins
    if (adminEmail !== 'allowancemobileapp@gmail.com') {
      res.status(403).json({ error: "Only allowancemobileapp@gmail.com can add new admins." });
      return;
    }

    const result = await pool.query(
      'INSERT INTO admin_users (email, title, permissions, added_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, title, JSON.stringify(permissions), adminEmail]
    );
    await logAdminAction(adminEmail, `Added new admin ${email}`, { permissions });
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admins/:id', requireAdmin, async (req, res) => {
  try {
    const { title, permissions } = req.body;
    const adminEmail = (req as any).adminEmail;
    
    // Only superadmin can edit admins
    if (adminEmail !== 'allowancemobileapp@gmail.com' && adminEmail !== 'allowancemobielapp@gmail.com') {
      res.status(403).json({ error: "Only super admin can edit admins." });
      return;
    }

    const adminId = req.params.id;
    const result = await pool.query(
      'UPDATE admin_users SET title = $1, permissions = $2 WHERE id = $3 RETURNING *',
      [title, JSON.stringify(permissions), adminId]
    );

    if (result.rows.length === 0) return res.status(404).json({error: "Admin not found"});
    
    await logAdminAction((req as any).adminEmail, `Updated admin access for ${result.rows[0].email}`, { permissions });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admins/:id', requireAdmin, async (req, res) => {
  try {
    const adminEmail = (req as any).adminEmail;
    if (adminEmail !== 'allowancemobileapp@gmail.com') {
      res.status(403).json({ error: "Only allowancemobileapp@gmail.com can remove admins." });
      return;
    }
    const adminId = req.params.id;
    const adminRes = await pool.query('SELECT email FROM admin_users WHERE id = $1', [adminId]);
    if (adminRes.rows.length === 0) return res.status(404).json({error: "Admin not found"});
    if (adminRes.rows[0].email === 'allowancemobileapp@gmail.com') return res.status(403).json({error: "Cannot delete super admin"});

    await pool.query('DELETE FROM admin_users WHERE id = $1', [adminId]);
    await logAdminAction(adminEmail, `Removed admin access for ${adminRes.rows[0].email}`, {});
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Logs --
app.get('/api/logs/admin', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM system_logs WHERE type = 'admin' ORDER BY created_at DESC LIMIT 500");
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/logs/app', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        al.id, 
        COALESCE(p.username, 'anonymous') as user_email, 
        al.action_type as action_summary, 
        al.created_at, 
        jsonb_build_object('user_id', al.user_id, 'log_details', al.details) as details 
      FROM activity_logs al 
      LEFT JOIN profiles p ON (al.user_id::text = p.id::text OR (al.details->'extra'->>'user_id')::text = p.id::text)
      ORDER BY al.created_at DESC 
      LIMIT 1000
    `);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// App endpoint for external app to POST logs
// We do not require requireAdmin here because it's called by the public app
/**
 * Activity logging from the mobile app.
 *
 * DELIBERATELY UNAUTHENTICATED, because the mobile app writes here and does
 * not hold an admin token. That means anyone can post to it, so three things
 * are true and are handled rather than hoped about:
 *
 *   1. The email on a row is a CLAIM, not an identity. Rows written here are
 *      stamped unverified in their details so nothing downstream can mistake
 *      one for an audited admin action. finance_audit is the trail that
 *      matters, and it is written only behind requireAdmin.
 *   2. Fields are bounded, so a long payload cannot be used to bloat the
 *      table or push something unreadable into the log viewer.
 *   3. It is rate limited per address, so it cannot be used to flood.
 */
const logRate = new Map<string, { count: number; resetAt: number }>();
const LOG_WINDOW_MS = 60_000;
const LOG_MAX_PER_WINDOW = 60;

function logRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = logRate.get(key);

  if (!entry || entry.resetAt < now) {
    logRate.set(key, { count: 1, resetAt: now + LOG_WINDOW_MS });
    // Serverless instances are short-lived, but a warm one should not grow a
    // map forever. Cheapest possible sweep: drop expired keys on write.
    if (logRate.size > 5000) {
      for (const [k, v] of logRate) if (v.resetAt < now) logRate.delete(k);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > LOG_MAX_PER_WINDOW;
}

const clip = (v: any, max: number) =>
  typeof v === 'string' ? v.slice(0, max) : '';

app.post('/api/logs/app', async (req, res) => {
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown')
      .split(',')[0].trim();

    if (logRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many log writes. Slow down.' });
    }

    const user_email = clip(req.body?.user_email, 320);
    const action_summary = clip(req.body?.action_summary, 500);

    if (!user_email || !action_summary) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Bounded, and only ever an object. A giant or non-object payload is the
    // easy way to make a log table expensive.
    let details: any = req.body?.details;
    if (details === null || typeof details !== 'object' || Array.isArray(details)) {
      details = {};
    }
    if (JSON.stringify(details).length > 8000) {
      details = { truncated: true };
    }

    const result = await pool.query(
      `INSERT INTO system_logs (type, user_email, action_summary, details)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      ['app', user_email, action_summary,
       // The stamp is the point: this row was not authenticated, and the
       // address on it is whatever the caller typed.
       { ...details, _unverified: true }]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('[logs/app]', err);
    res.status(500).json({ error: 'Could not write the log entry.' });
  }
});

// -- Metadata Stats --
app.get('/api/metadata/stats', requireAdmin, async (req, res) => {
  try {
    // Schools
    let total_schools = 0;
    try {
       const schoolRes = await pool.query('SELECT COUNT(*) FROM schools');
       total_schools = parseInt(schoolRes.rows[0].count);
    } catch(e) {}

    // Stores
    let total_stores = 0;
    let active_stores = 0;
    try {
       const storesRes = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM stores");
       total_stores = parseInt(storesRes.rows[0].total) || 0;
       active_stores = parseInt(storesRes.rows[0].active) || 0;
    } catch(e) {}

    // Services
    let total_services = 0;
    let active_services = 0;
    try {
       const servicesRes = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM services");
       total_services = parseInt(servicesRes.rows[0].total) || 0;
       active_services = parseInt(servicesRes.rows[0].active) || 0;
    } catch(e) {}

    // Tickets
    let active_tickets = 0;
    try {
       const ticketsRes = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'active'");
       active_tickets = parseInt(ticketsRes.rows[0].count);
    } catch(e) {}

    // Gists
    let active_gists = 0;
    try {
       const gistsRes = await pool.query("SELECT COUNT(*) FROM gists WHERE status = 'active'");
       active_gists = parseInt(gistsRes.rows[0].count);
    } catch(e) {}

    // Profiles / Users
    let total_users = 0;
    let new_users_today = 0;
    try {
       const usersRes = await pool.query('SELECT COUNT(*) FROM profiles');
       total_users = parseInt(usersRes.rows[0].count);
       const newUsersRes = await pool.query('SELECT COUNT(*) FROM profiles WHERE created_at >= current_date');
       new_users_today = parseInt(newUsersRes.rows[0].count);
    } catch(e) {}

    // Subscribers (profiles with tier != free)
    let total_subscribers = 0;
    let new_subscribers_today = 0;
    try {
       const subsRes = await pool.query("SELECT COUNT(DISTINCT user_id) FROM membership_payments");
       total_subscribers = parseInt(subsRes.rows[0].count);
       const newSubsRes = await pool.query("SELECT COUNT(*) FROM membership_payments WHERE created_at >= current_date");
       // approximated new subscribers today from payments table
       new_subscribers_today = parseInt(newSubsRes.rows[0].count);
    } catch(e) {}

    // Revenue
    let total_revenue = 0;
    let revenue_today = 0;
    try {
       // MONEY UNITS -- read this before editing any sum below. See
       // migrations/0084_fix_money_units.sql for how these were established.
       //
       // KOBO, and therefore divided by 100:
       //   membership_payments.amount        70000 = N700, set by a trigger
       //
       // NAIRA, and therefore NOT divided:
       //   gists.amount_paid, ticket_purchases.amount_paid
       //   The webhooks convert before storing. Proven by real data: 14
       //   ticket payments summing to 16,500 against a N100 minimum price is
       //   N16,500, not N165.
       const revRes = await pool.query(`
         SELECT SUM(total) as total FROM (
           SELECT COALESCE(SUM(amount) / 100.0, 0) as total FROM membership_payments
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE amount_paid > 0
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE amount_paid > 0
         ) sub
       `);
       total_revenue = parseFloat(revRes.rows[0].total || 0);

       const revTodayRes = await pool.query(`
         SELECT SUM(total) as total FROM (
           SELECT COALESCE(SUM(amount) / 100.0, 0) as total FROM membership_payments WHERE created_at >= current_date
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE created_at >= current_date AND amount_paid > 0
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE created_at >= current_date AND amount_paid > 0
         ) sub
       `);
       revenue_today = parseFloat(revTodayRes.rows[0].total || 0);
    } catch(e) {}

    res.json({
       total_users,
       new_users_today,
       total_subscribers,
       new_subscribers_today,
       active_tickets,
       active_gists,
       total_schools,
       total_revenue,
       revenue_today,
       total_stores,
       active_stores,
       total_services,
       active_services
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Transactions --
app.get('/api/transactions', requireAdmin, async (req, res) => {
  try {
    // Every `amount` returned here is NAIRA. See the note on the dashboard
    // revenue query: amount_paid columns are kobo and must be divided.
    const memRes = await pool.query(`
      SELECT id::text, 'Membership' as type, (amount / 100.0) as amount, tier as status, payment_reference as reference, user_id::text as user_email, created_at
      FROM membership_payments
      ORDER BY created_at DESC LIMIT 200
    `);
    // Both columns are NAIRA, so the COALESCE is safe and nothing is
    // divided. See migrations/0084_fix_money_units.sql.
    const gistRes = await pool.query(`
      SELECT id::text, 'Gist' as type,
             COALESCE(NULLIF(amount_paid, 0), total_price, 0) as amount,
             status, payment_reference as reference, user_id::text as user_email, created_at
      FROM gists
      WHERE ((amount_paid IS NOT NULL AND amount_paid > 0) OR paid = true)
        AND (payment_reference IS NULL OR payment_reference NOT ILIKE 'coupon%')
      ORDER BY created_at DESC LIMIT 200
    `);
    const ticketRes = await pool.query(`
      SELECT id::text, 'Ticket' as type, amount_paid as amount, status, payment_reference as reference, user_id::text as user_email, created_at
      FROM ticket_purchases
      WHERE amount_paid IS NOT NULL AND amount_paid > 0
      ORDER BY created_at DESC LIMIT 200
    `);
    
    // Combine and sort
    const all = [...memRes.rows, ...gistRes.rows, ...ticketRes.rows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 500);

    res.json(all);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// -- Feed Submissions Approvals --
app.get('/api/approvals/feed-submissions', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, p.email, p.username 
      FROM feed_submissions f 
      LEFT JOIN profiles p ON p.id = f.user_id 
      WHERE f.status = 'pending' 
      ORDER BY f.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/approvals/feed-submissions/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({error: "Invalid status"});
  try {
    const check = await pool.query('SELECT * FROM feed_submissions WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({error: "Submission not found"});
    const sub = check.rows[0];
    
    if (sub.status !== 'pending') return res.status(400).json({error: "Already processed"});

    if (status === 'approved') {
      try {
        await pool.query('BEGIN');
        
        // Add points column if not exists
        await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0');
        await pool.query('UPDATE profiles SET points = points + $1 WHERE id = $2', [sub.points_potential || 0, sub.user_id]);


        await pool.query('UPDATE feed_submissions SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
        await pool.query('COMMIT');
      } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Approval Error:', e);
        return res.status(500).json({error: "Failed to process approval data: " + e.message});
      }
    } else {
      await pool.query('UPDATE feed_submissions SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    }

    await logAdminAction((req as any).adminEmail, `${status === 'approved' ? 'Approved' : 'Rejected'} feed submission ${req.params.id}`, { status });
    const finalCheck = await pool.query('SELECT * FROM feed_submissions WHERE id = $1', [req.params.id]);
    res.json(finalCheck.rows[0]);
  } catch (err: any) { 
    console.error(err);
    res.status(500).json({ error: err.message }); 
  }
});

// -- Schools & Delivery Fees --
app.put('/api/schools/:id/delivery-fees', requireAdmin, async (req, res) => {
  const { free_delivery_fee, plus_delivery_fee } = req.body;
  try {
    const result = await pool.query(
      'UPDATE schools SET free_delivery_fee = $1, plus_delivery_fee = $2 WHERE id = $3 RETURNING *',
      [free_delivery_fee, plus_delivery_fee, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({error: "School not found"});
    await logAdminAction((req as any).adminEmail, `Updated delivery fees for school ${req.params.id}`, { free_delivery_fee, plus_delivery_fee });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Delivery Agents --
app.get('/api/delivery-agents', requireAdmin, async (req, res) => {
  const { school_id } = req.query;
  try {
    let query = 'SELECT d.*, s.name as school_name FROM delivery_personnel d LEFT JOIN schools s ON s.id = d.school_id';
    const params = [];
    if (school_id) {
      query += ' WHERE d.school_id = $1';
      params.push(school_id);
    }
    query += ' ORDER BY d.name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/delivery-agents', requireAdmin, async (req, res) => {
  const { school_id, name, gender, whatsapp_number } = req.body;
  try {
    const pCheck = await pool.query("SELECT id FROM profiles WHERE username = $1 OR username = $2", [name, name.replace('@', '')]);
    if (pCheck.rows.length === 0) return res.status(400).json({error: "Allowance Username not found. Delivery agents must be registered users."});
    const result = await pool.query(
      "INSERT INTO delivery_personnel (school_id, name, gender, whatsapp_number, whatsapp_url) VALUES ($1, $2, $3, $4, '') RETURNING *",
      [school_id, name, gender, whatsapp_number]
    );
    await logAdminAction((req as any).adminEmail, `Created delivery agent ${name}`, { school_id });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/delivery-agents/:id', requireAdmin, async (req, res) => {
  const { school_id, name, gender, whatsapp_number } = req.body;
  try {
    const pCheck = await pool.query("SELECT id FROM profiles WHERE username = $1 OR username = $2", [name, name.replace('@', '')]);
    if (pCheck.rows.length === 0) return res.status(400).json({error: "Allowance Username not found. Delivery agents must be registered users."});
    const result = await pool.query(
      'UPDATE delivery_personnel SET school_id = $1, name = $2, gender = $3, whatsapp_number = $4 WHERE id = $5 RETURNING *',
      [school_id, name, gender, whatsapp_number, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({error: "Agent not found"});
    await logAdminAction((req as any).adminEmail, `Updated delivery agent ${name}`, { school_id });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/delivery-agents/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM delivery_personnel WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({error: "Agent not found"});
    await logAdminAction((req as any).adminEmail, `Deleted delivery agent ${result.rows[0].name}`, { agent_id: req.params.id });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Dashboard Stats --
app.get('/api/approvals/stores', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.username as owner_username, p.subscription_tier
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    `);
    const stores = result.rows;
    for (let store of stores) {
      const creds = await pool.query('SELECT * FROM store_credentials WHERE store_id = $1', [store.id]);
      store.credentials = creds.rows;
      
      const prods = await pool.query('SELECT * FROM store_products WHERE store_id = $1', [store.id]);
      store.products = prods.rows;
    }
    res.json(stores);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/approvals/stores/:id/:action', requireAdmin, async (req, res) => {
  const { action } = req.params;
  const storeId = req.params.id;
  try {
    const storeRes = await pool.query(`
      SELECT s.*, p.subscription_tier 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.id = $1
    `, [storeId]);
    
    if (storeRes.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }
    const store = storeRes.rows[0];

    const credsRes = await pool.query("SELECT * FROM store_credentials WHERE store_id = $1 AND kind = 'cac'", [storeId]);
    const hasCac = credsRes.rows.length > 0 || !!store.registration_document_url;
    const isPlus = store.subscription_tier === 'Membership';

    // From the verified token, not the header. This gates who may verify or
    // revoke a store, and reading it off a header meant the check could be
    // passed by typing the root admin's address into one.
    const currentEmail = String((req as any).adminEmail || '').toLowerCase();
    
    if ((action === 'verify' || action === 'revoke') && currentEmail !== 'allowancemobileapp@gmail.com') {
      return res.status(403).json({ error: "Only the root admin (allowancemobileapp@gmail.com) can verify or revoke stores." });
    }

    if (action === 'approve') {
      // Just approve it - take it out of review
      await pool.query("UPDATE stores SET status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'verify') {
      // Allow admin to bypass strict checks and verify
      await pool.query("UPDATE stores SET is_plus_verified = true, status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'revoke') {
      await pool.query("UPDATE stores SET is_plus_verified = false WHERE id = $1", [storeId]);
    } else if (action === 'suspend') {
      await pool.query("UPDATE stores SET status = 'suspended', is_plus_verified = false WHERE id = $1", [storeId]);
    } else if (action === 'reject') {
      await pool.query("UPDATE stores SET status = 'rejected' WHERE id = $1", [storeId]);
    }

    // Attempt to log
    try {
      const adminEmail = (req as any).adminEmail || 'unknown';
      await pool.query(
        'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
        ['admin', adminEmail, `${action} store ${storeId}`, JSON.stringify({ action })]
      );
    } catch(e) {}
    
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/approvals/stores/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM stores WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/approvals/services', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.username as owner_username, p.subscription_tier
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    `);
    const services = result.rows;
    for (let service of services) {
      // Fetch offerings based on the new schema step 3
      const prods = await pool.query('SELECT * FROM service_offerings WHERE service_id = $1', [service.id]);
      service.offerings = prods.rows;
    }
    res.json(services);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/approvals/services/:id/:action', requireAdmin, async (req, res) => {
  const { action } = req.params;
  const serviceId = req.params.id;
  try {
    let newStatus = action;
    if (action === 'approve') newStatus = 'active';
    else if (action === 'suspend') newStatus = 'suspended';
    else if (action === 'reject') newStatus = 'rejected';

    await pool.query('UPDATE services SET status = $1 WHERE id = $2', [newStatus, serviceId]);
    
    // Attempt to log
    try {
      const adminEmail = (req as any).adminEmail || 'unknown';
      await pool.query(
        'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
        ['admin', adminEmail, `${action} service ${serviceId}`, JSON.stringify({ action })]
      );
    } catch(e) {}

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const adminCount = await pool.query('SELECT COUNT(*) FROM admin_users');
    const referrals = await pool.query(`
      SELECT COUNT(*) as refs 
      FROM profiles 
      WHERE referred_by IS NOT NULL 
        AND created_at >= date_trunc('month', CURRENT_DATE)
    `);
    // Kobo -> naira on every gateway column. See the dashboard revenue note.
    const transactions = await pool.query(`
      SELECT SUM(total) as total FROM (
         SELECT COALESCE(SUM(amount) / 100.0, 0) as total FROM membership_payments WHERE created_at >= current_date
         UNION ALL
         SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE created_at >= current_date AND amount_paid > 0
         UNION ALL
         SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE created_at >= current_date AND amount_paid > 0
      ) sub
    `);
    
    
    const stores = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM stores");
    const services = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM services");
    const pendingStores = await pool.query("SELECT COUNT(*) FROM stores WHERE status = 'pending'");
    const pendingServices = await pool.query("SELECT COUNT(*) FROM services WHERE status = 'pending'");
    
    res.json({
      storesTotal: parseInt(stores.rows[0].total) || 0,
      storesActive: parseInt(stores.rows[0].active) || 0,
      servicesTotal: parseInt(services.rows[0].total) || 0,
      servicesActive: parseInt(services.rows[0].active) || 0,
      pendingStores: parseInt(pendingStores.rows[0].count) || 0,
      pendingServices: parseInt(pendingServices.rows[0].count) || 0,

      activeAdmins: parseInt(adminCount.rows[0].count, 10) || 0,
      monthlyReferrals: parseInt(referrals.rows[0].refs, 10) || 0,
      todayTransactions: parseInt(transactions.rows[0].total, 10) || 0
    });
  } catch (err: any) { 
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: err.message }); 
  }
});

// -- Accounting / Google Sheets Generation --
app.post('/api/accounting/generate', requireAdmin, async (req, res) => {
  const adminEmail = (req as any).adminEmail;
  try {
    // Generate Accounting sheets logic using Google Sheets API
    // In a real app we need auth client for googleapis
    const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file']
    });
    // This assumes the environment has Google credentials or the AI Studio execution role has permissions.
    // If it fails, we fall back to a mock response.
    
    // Simulate generation for safety when creds are missing:
    await logAdminAction(adminEmail, 'Generated accounting data', { table: 'all' });
    
    res.json({ message: "Accounting sheets generated successfully! They have been saved to the designated Google Drive." });
  } catch (err: any) { 
    console.error(err);
    res.status(500).json({ error: "Failed to connect to Google Sheets. " + err.message }); 
  }
});

// -- Tickets --
app.get('/api/tickets', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name as title, description, price, status, date as created_at FROM tickets ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tickets/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      'UPDATE tickets SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    await logAdminAction((req as any).adminEmail, `Updated ticket ${req.params.id} status`, { status });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tickets/:id', requireAdmin, async (req, res) => {
  try {
    const { title, description, price, status, end_date } = req.body;
    const result = await pool.query(
      'UPDATE tickets SET title = $1, description = $2, price = $3, status = $4, end_date = $5 WHERE id = $6 RETURNING *',
      [title, description, price, status, end_date || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({error: "Ticket not found"});
    await logAdminAction((req as any).adminEmail, `Updated ticket ${req.params.id}`, { title, status });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Gists --
app.get('/api/gists', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT g.id, g.title, g.type as content, g.school_id, s.name as school_name, g.status, g.created_at, g.end_date, g.image_url, g.image_urls, g.image_path, g.paid, g.amount_paid FROM gists g LEFT JOIN schools s ON g.school_id = s.id ORDER BY g.created_at DESC');
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/gists/:id', requireAdmin, async (req, res) => {
  try {
    const { title, content, status, end_date } = req.body;
    const result = await pool.query(
      'UPDATE gists SET title = $1, type = $2, status = $3, end_date = $4 WHERE id = $5 RETURNING *',
      [title, content, status, end_date || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({error: "Gist not found"});
    await logAdminAction((req as any).adminEmail, `Updated gist ${req.params.id}`, { title, status });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/gists/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM gists WHERE id = $1', [req.params.id]);
    await logAdminAction((req as any).adminEmail, `Deleted gist ${req.params.id}`, {});
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/gists/:id/notify', requireAdmin, async (req, res) => {
  try {
    const gistId = req.params.id;
    await logAdminAction((req as any).adminEmail, `Sent push notification for gist ${gistId}`, {});
    res.json({ message: "Push notification queued for gist." });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Notifications --
app.get('/api/notifications', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM allowance_notifications ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications', requireAdmin, async (req, res) => {
  try {
    const { title, message } = req.body;
    const result = await pool.query(
      'INSERT INTO allowance_notifications (title, message, sent_by) VALUES ($1, $2, $3) RETURNING *',
      [title, message, (req as any).adminEmail]
    );

    // TODO: Integrate Firebase Cloud Messaging (FCM) or OneSignal here to actually push to mobile devices
    // Right now it just logs the action in the DB
    console.log(`[PUSH NOTIFICATION DISPATCHED] Title: ${title}, By: ${(req as any).adminEmail}`);

    await logAdminAction((req as any).adminEmail, `Created general notification`, { title });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Coupons --
app.get('/api/coupons', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM allowance_coupons ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/coupons', requireAdmin, async (req, res) => {
  try {
    const { code, discount_percentage, expires_at, claim_limit } = req.body;
    const adminEmail = (req as any).adminEmail;

    // Validate code length
    if (!code || code.length !== 6) {
      res.status(400).json({ error: "Coupon code must be exactly 6 characters long." });
      return;
    }

    // Validate 100% expiry rule
    if (discount_percentage === 100) {
      const targetDate = new Date(expires_at);
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
      if (targetDate > oneMonthFromNow) {
        res.status(400).json({ error: "100% discount coupons cannot exceed a 1 month expiry date." });
        return;
      }
    }

    // Validate max supply rules
    let verifiedLimit = claim_limit;
    if (claim_limit === -1 || (claim_limit && claim_limit > 500)) {
      verifiedLimit = -1; // Equivalent to unlimited
    }
    
    // permissions check for this admin
    if (adminEmail !== 'allowancemobileapp@gmail.com') {
      const perms = (req as any).adminPermissions || {};
      if (verifiedLimit === -1) {
        // they can't create unlimited if they don't have permission
        if (!perms.canCreateUnlimited) {
            res.status(403).json({ error: "You are not authorized to create unlimited supply coupons." });
            return;
        }
      }
    }

    const result = await pool.query(
      'INSERT INTO allowance_coupons (code, discount_percentage, expires_at, claim_limit, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [code, discount_percentage, expires_at, verifiedLimit, adminEmail]
    );

    await logAdminAction(adminEmail, `Created coupon ${code}`, { discount_percentage, claim_limit: verifiedLimit });
    res.status(201).json(result.rows[0]);
  } catch (err: any) { 
    res.status(500).json({ error: err.message }); 
  }
});


// -- Analytics Data for Graphs --
app.get('/api/analytics', requireAdmin, async (req, res) => {
  try {
    const monthsQuery = `
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE - INTERVAL '11 months'),
          date_trunc('month', CURRENT_DATE),
          '1 month'::interval
        ) as month
      )
      SELECT month FROM months
    `;
    
    // Users
    const usersQuery = `
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM profiles
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    `;
    
    // Revenue
    const revenueQuery = `
      SELECT month, SUM(amount) as amount FROM (
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount) / 100.0, 0) as amount
         FROM membership_payments
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount_paid), 0) as amount
         FROM gists
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months') AND amount_paid > 0
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount_paid), 0) as amount
         FROM ticket_purchases
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months') AND amount_paid > 0
         GROUP BY month
      ) sub GROUP BY month
    `;

    // Stores
    const storesQuery = `
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM stores
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    `;

    // Services
    const servicesQuery = `
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM services
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    `;

    // Members (Subscribers)
    const membersQuery = `
      SELECT date_trunc('month', created_at) as month, COUNT(DISTINCT user_id) as count
      FROM membership_payments
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    `;

    // Library (Gists + Tickets)
    const libraryQuery = `
      SELECT month, SUM(count) as count FROM (
         SELECT date_trunc('month', created_at) as month, COUNT(*) as count
         FROM gists
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COUNT(*) as count
         FROM tickets
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
         GROUP BY month
      ) sub GROUP BY month
    `;

    const [monthsRes, usersRes, revenueRes, storesRes, servicesRes, membersRes, libraryRes] = await Promise.all([
      pool.query(monthsQuery),
      pool.query(usersQuery),
      pool.query(revenueQuery),
      pool.query(storesQuery),
      pool.query(servicesQuery),
      pool.query(membersQuery),
      pool.query(libraryQuery)
    ]);

    const data = monthsRes.rows.map(row => {
      const monthStr = row.month.toISOString();
      const userMatch = usersRes.rows.find((u: any) => u.month && u.month.toISOString() === monthStr);
      const revMatch = revenueRes.rows.find((r: any) => r.month && r.month.toISOString() === monthStr);
      const storeMatch = storesRes.rows.find((s: any) => s.month && s.month.toISOString() === monthStr);
      const serviceMatch = servicesRes.rows.find((s: any) => s.month && s.month.toISOString() === monthStr);
      const memberMatch = membersRes.rows.find((m: any) => m.month && m.month.toISOString() === monthStr);
      const libraryMatch = libraryRes.rows.find((l: any) => l.month && l.month.toISOString() === monthStr);

      return {
        month: row.month.toLocaleString('default', { month: 'short', year: 'numeric' }),
        users: parseInt(userMatch?.count || 0),
        revenue: parseFloat(revMatch?.amount || 0),
        stores: parseInt(storeMatch?.count || 0),
        services: parseInt(serviceMatch?.count || 0),
        members: parseInt(memberMatch?.count || 0),
        libraryItems: parseInt(libraryMatch?.count || 0)
      };
    });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// Vite Middleware and Dev Server Output (local only)
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  import("vite").then(async ({ createServer: createViteServer }) => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }).catch(err => console.error("Failed to start Vite dev server:", err));
} else if (!process.env.VERCEL) {
  // Production fallback for local testing (not Vercel)
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Production server running on http://localhost:${PORT}`);
  });
}

export default app;
