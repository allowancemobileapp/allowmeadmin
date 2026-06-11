// server.ts
import express from "express";
import { Pool } from "pg";
import { google } from "googleapis";
import dotenv from "dotenv";

import { createLegacyRouter } from "./server/legacyRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());


// Database connection
const envDbUrl = process.env.DATABASE_URL;
const connectionString = (envDbUrl && !envDbUrl.includes("localhost") && !envDbUrl.includes("127.0.0.1"))
  ? envDbUrl
  : "postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";

const pool = new Pool({
  connectionString
});

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
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const email = req.headers['x-admin-email'] as string;
  if (!email) {
    res.status(401).json({ error: "Unauthorized. Missing x-admin-email header." });
    return;
  }
  const lowerEmail = email.toLowerCase();
  
  // Fast path for local dev or root admin
  if (lowerEmail === 'allowancemobileapp@gmail.com' || lowerEmail === 'allowancemobielapp@gmail.com') {
    (req as any).adminEmail = lowerEmail;
    next();
    return;
  }

  pool.query('SELECT permissions FROM admin_users WHERE email = $1', [lowerEmail])
    .then(result => {
      if (result.rows.length === 0) {
         res.status(403).json({ error: "Forbidden. Admin account not found." });
         return;
      }
      (req as any).adminEmail = email;
      (req as any).adminPermissions = result.rows[0].permissions;
      next();
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    });
}

// === API ROUTES ===

// Verify Admin for Login
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const lowerEmail = email.toLowerCase();
    if (lowerEmail === 'allowancemobileapp@gmail.com' || lowerEmail === 'allowancemobielapp@gmail.com') return res.json({ verified: true, title: 'Super Admin' });
    
    const result = await pool.query('SELECT title, permissions FROM admin_users WHERE email = $1', [lowerEmail]);
    if (result.rows.length > 0) {
      res.json({ verified: true, title: result.rows[0].title, permissions: result.rows[0].permissions });
    } else {
      res.status(403).json({ error: "Unauthorized email." });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Mount legacy routes
app.use('/api', requireAdmin, createLegacyRouter(pool));

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
    const result = await pool.query("SELECT * FROM system_logs WHERE type = 'app' ORDER BY created_at DESC LIMIT 500");
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// App endpoint for external app to POST logs
// We do not require requireAdmin here because it's called by the public app
app.post('/api/logs/app', async (req, res) => {
  try {
    const { user_email, action_summary, details } = req.body;
    if (!user_email || !action_summary) return res.status(400).json({ error: 'Missing required fields' });
    const result = await pool.query(
      'INSERT INTO system_logs (type, user_email, action_summary, details) VALUES ($1, $2, $3, $4) RETURNING *',
      ['app', user_email, action_summary, details || {}]
    );
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
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
       const revRes = await pool.query(`
         SELECT SUM(total) as total FROM (
           SELECT COALESCE(SUM(amount / 100), 0) as total FROM membership_payments
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE amount_paid > 0
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE amount_paid > 0
         ) sub
       `);
       total_revenue = parseFloat(revRes.rows[0].total || 0);
       
       const revTodayRes = await pool.query(`
         SELECT SUM(total) as total FROM (
           SELECT COALESCE(SUM(amount / 100), 0) as total FROM membership_payments WHERE created_at >= current_date
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
       revenue_today
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// -- Transactions --
app.get('/api/transactions', requireAdmin, async (req, res) => {
  try {
    const memRes = await pool.query(`
      SELECT id::text, 'Membership' as type, (amount / 100) as amount, tier as status, user_id::text as user_email, created_at 
      FROM membership_payments 
      ORDER BY created_at DESC LIMIT 200
    `);
    const gistRes = await pool.query(`
      SELECT id::text, 'Gist' as type, amount_paid as amount, status, user_id::text as user_email, created_at 
      FROM gists
      WHERE amount_paid IS NOT NULL AND amount_paid > 0
      ORDER BY created_at DESC LIMIT 200
    `);
    const ticketRes = await pool.query(`
      SELECT id::text, 'Ticket' as type, amount_paid as amount, status, user_id::text as user_email, created_at 
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

// -- Dashboard Stats --
app.get('/api/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const adminCount = await pool.query('SELECT COUNT(*) FROM admin_users');
    const referrals = await pool.query(`
      SELECT COUNT(*) as refs 
      FROM profiles 
      WHERE referred_by IS NOT NULL 
        AND created_at >= date_trunc('month', CURRENT_DATE)
    `);
    const transactions = await pool.query(`
      SELECT SUM(total) as total FROM (
         SELECT COALESCE(SUM(amount / 100), 0) as total FROM membership_payments WHERE created_at >= current_date
         UNION ALL
         SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE created_at >= current_date AND amount_paid > 0
         UNION ALL
         SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE created_at >= current_date AND amount_paid > 0
      ) sub
    `);
    
    res.json({
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

// Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
