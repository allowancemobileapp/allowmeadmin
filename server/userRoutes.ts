import { Router } from "express";
import { asAdmin } from "./asAdmin.js";

export function createUserRouter(pool: any) {
  const router = Router();
  const handleReq = (handler: any) => async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  };

  const logAdminAction = async (req: any, action: string, details: any) => {
    try {
      const adminEmail = req.adminEmail || 'unknown';
      await pool.query(
        'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
        ['admin', adminEmail, action, JSON.stringify(details)]
      );
    } catch(e) { console.error('Failed to log admin action', e); }
  };

  router.get('/', handleReq(async (req: any, res: any) => {
    const { sort } = req.query;
    // Interpolated into the SQL below, which is only safe because this
    // ternary can produce exactly two values and neither comes from the
    // request. A column name or a direction cannot be a bound parameter, so
    // if this ever grows more options it needs a whitelist, not a passthrough.
    const order = sort === 'newest' ? 'DESC' : 'ASC';

    const result = await pool.query(`
      SELECT * FROM (
        SELECT 
          id, username, full_name, email, avatar_url, subscription_tier, created_at, school_name, bio,
          ROW_NUMBER() OVER (ORDER BY created_at ASC) as rank
        FROM profiles 
      ) as ranked_profiles
      ORDER BY created_at ${order}
    `);
    res.json(result.rows);
  }));

  router.get('/:id', handleReq(async (req: any, res: any) => {
    const { id } = req.params;
    const profileRes = await pool.query(`
      SELECT p.*, r.username as referrer_username, r.full_name as referrer_full_name 
      FROM profiles p
      LEFT JOIN profiles r ON p.referred_by = r.id
      WHERE p.id = $1
    `, [id]);
    if (profileRes.rows.length === 0) return res.status(404).json({error: 'User not found'});
    
    const profile = profileRes.rows[0];
    const gistsRes = await pool.query('SELECT COUNT(*) FROM gists WHERE user_id = $1', [id]);
    const momentsRes = await pool.query('SELECT COUNT(*) FROM moments WHERE user_id = $1', [id]);
    const storiesRes = await pool.query('SELECT COUNT(*) FROM stories WHERE user_id = $1', [id]);
    const ticketsRes = await pool.query('SELECT COUNT(*) FROM tickets WHERE user_id = $1', [id]);
    
    // Also fetch their actual content so we can display it
    const gistsData = await pool.query('SELECT * FROM gists WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    const momentsData = await pool.query('SELECT * FROM moments WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    const storiesData = await pool.query('SELECT * FROM stories WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    const ticketsData = await pool.query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC', [id]);

    res.json({
      ...profile,
      gists_count: parseInt(gistsRes.rows[0].count),
      moments_count: parseInt(momentsRes.rows[0].count),
      stories_count: parseInt(storiesRes.rows[0].count),
      tickets_count: parseInt(ticketsRes.rows[0].count),
      gists: gistsData.rows,
      moments: momentsData.rows,
      stories: storiesData.rows,
      tickets: ticketsData.rows,
    });
  }));

  router.put('/:id/upgrade', handleReq(async (req: any, res: any) => {
    const { id } = req.params;
    const adminEmail = req.adminEmail;
    
    if (adminEmail !== 'allowancemobileapp@gmail.com') {
      return res.status(403).json({ error: 'Only allowancemobileapp@gmail.com can upgrade users.' });
    }

    // WAS: a direct UPDATE of subscription_tier and subscription_expires_at,
    // granting TEN YEARS. docs/PAYMENTS.md §12 forbids exactly that write --
    // and because this server connects as postgres, the guard trigger let it
    // through. That is the doc's "if it ever were not refused it would be a
    // hole", and it was open. Both directions now go through the §5 RPCs,
    // which cap a grant at 366 days and gate on is_app_admin().
    const { tier } = req.body; // 'plus' or 'free'
    const days = Number.isInteger(Number(req.body.days)) ? Number(req.body.days) : 30;

    const who = await pool.query('SELECT username FROM profiles WHERE id = $1', [id]);
    if (!who.rows[0]?.username) {
      return res.status(404).json({ error: 'No such user, or they have no username yet.' });
    }
    const username = who.rows[0].username;
    const wantsPlus = String(tier).toLowerCase() === 'plus'
                   || String(tier).toLowerCase() === 'membership';

    const out = await asAdmin(pool, adminEmail, async (c) => {
      const r = wantsPlus
        ? await c.query('SELECT public.admin_grant_plus($1, $2) AS result', [username, days])
        : await c.query('SELECT public.admin_revoke_plus($1) AS result', [username]);
      return r.rows[0]?.result || {};
    });

    if (out.ok !== true) {
      const why: Record<string, string> = {
        not_admin: 'The database does not recognise this account as an app admin.',
        no_such_user: `No user called @${username}.`,
        days_out_of_range: `${days} days is outside the allowed 1 to 366.`,
      };
      return res.status(400).json({ error: why[out.reason] || `Refused: ${out.reason}` });
    }

    await logAdminAction(req,
      wantsPlus ? `Granted @${username} ${days} days of Plus` : `Revoked Plus from @${username}`,
      { username, days: wantsPlus ? days : 0, ...out });

    const fresh = await pool.query(
      'SELECT id, subscription_tier, subscription_expires_at FROM profiles WHERE id = $1', [id]);

    res.json({
      ...fresh.rows[0],
      // §12 MUST: when revoke says has_paystack_customer, the admin has to be
      // told to cancel at Paystack. The Users page surfaces this.
      must_cancel_at_paystack: !wantsPlus && out.has_paystack_customer === true,
    });
  }));

  // Endpoint to edit a gist
  router.put('/:id/gists/:gistId', handleReq(async (req: any, res: any) => {
    const { id, gistId } = req.params;
    const { title, category } = req.body;
    const result = await pool.query(
      'UPDATE gists SET title = $1, category = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [title, category, gistId, id]
    );

    await logAdminAction(req, `Edited gist ${gistId} for user ${id}`, { title, category });

    res.json(result.rows[0]);
  }));

  // Endpoint to edit a moment
  router.put('/:id/moments/:momentId', handleReq(async (req: any, res: any) => {
    const { id, momentId } = req.params;
    const { caption, category } = req.body;
    const result = await pool.query(
      'UPDATE moments SET caption = $1, category = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [caption, category, momentId, id]
    );

    await logAdminAction(req, `Edited moment ${momentId} for user ${id}`, { caption, category });

    res.json(result.rows[0]);
  }));

  // Endpoint to edit a story
  router.put('/:id/stories/:storyId', handleReq(async (req: any, res: any) => {
    const { id, storyId } = req.params;
    const { caption } = req.body;
    const result = await pool.query(
      'UPDATE stories SET caption = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [caption, storyId, id]
    );

    await logAdminAction(req, `Edited story ${storyId} for user ${id}`, { caption });

    res.json(result.rows[0]);
  }));

  return router;
}
