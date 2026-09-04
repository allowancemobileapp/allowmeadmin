import { Router } from "express";
import { Pool } from "pg";

/**
 * Reviewing who gets to be a delivery agent or a transport vendor.
 *
 * WHAT THIS IS FOR. Until the app's 0087, "become a delivery agent" was a
 * client-side UPDATE on your own profile row: anybody who tapped it was
 * instantly listed, accepting orders and collecting cash from students, with
 * no vetting at all. 0087 locked the column behind a trigger and built an
 * application queue. This is the other half -- the screen where a person
 * actually reads the applications and decides.
 *
 * THE FLAG IS NEVER SET FROM HERE. Every route below goes through
 * review_role_application() or revoke_role(), which are the only things that
 * may move profiles.is_delivery_agent or is_transport_vendor. The service
 * role bypasses row-level security but NOT triggers, so even this server
 * cannot flip the flag by hand -- and that is deliberate, because a promotion
 * with nobody's name against it is what 0087 was written to end.
 */
export function createRolesRouter(pool: Pool) {
  const router = Router();

  const handle = (fn: any) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (e: any) {
      console.error('[roles]', e);
      // A missing function means the migration has not been run, which is a
      // fixable setup problem rather than a server fault. Saying which file
      // beats a 500 that leaves somebody guessing.
      if (e.code === '42883' || e.code === '42P01') {
        return res.status(400).json({
          error: 'The role review tables are not there yet. Run the app\'s '
               + '0087_role_applications.sql, then '
               + 'migrations/0093_role_application_review.sql.',
        });
      }
      res.status(400).json({ error: e.message });
    }
  };

  const logAdminAction = async (req: any, action: string, details: any) => {
    try {
      await pool.query(
        `INSERT INTO system_logs (type, admin_email, action, details)
         VALUES ($1, $2, $3, $4)`,
        ['admin', req.adminEmail || 'unknown', action, JSON.stringify(details)]);
    } catch (e) { console.error('log failed', e); }
  };

  /**
   * The queue.
   *
   * Pending first and oldest first, because somebody who applied three weeks
   * ago has been waiting three weeks. Decided applications stay readable so a
   * rejection can be looked up when the person asks why.
   */
  router.get('/applications', handle(async (req: any, res: any) => {
    const status = String(req.query.status || 'pending');
    const kind = req.query.kind ? String(req.query.kind) : null;

    const r = await pool.query(`
      SELECT * FROM role_application_queue
      WHERE ($1 = 'all' OR status = $1)
        AND ($2::text IS NULL OR kind = $2)
      ORDER BY
        -- Pending at the top whatever else is being shown.
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        CASE WHEN status = 'pending' THEN created_at END ASC,
        reviewed_at DESC NULLS LAST
      LIMIT 200`, [status, kind]);

    const counts = await pool.query(`
      SELECT kind, status, COUNT(*)::int AS n
      FROM role_applications GROUP BY kind, status`);

    res.json({
      applications: r.rows.map((a: any) => ({
        ...a,
        previous_rejections: Number(a.previous_rejections || 0),
      })),
      counts: counts.rows,
    });
  }));

  /** One person's whole history with these roles. */
  router.get('/applications/:userId/history', handle(async (req: any, res: any) => {
    const r = await pool.query(`
      SELECT id, kind, status, note, review_note, reviewer_email,
             reviewed_at, created_at
      FROM role_applications
      WHERE user_id = $1
      ORDER BY created_at DESC`, [req.params.userId]);
    res.json(r.rows);
  }));

  /**
   * Decide one.
   *
   * The reviewer's email comes from req.adminEmail, which requireAdmin takes
   * from a verified Firebase token -- never from the request body. A decision
   * attributed to whoever the caller claimed to be would be worth nothing.
   */
  router.post('/applications/:id/review', handle(async (req: any, res: any) => {
    const { decision, note } = req.body;

    if (decision !== 'approved' && decision !== 'rejected') {
      return res.status(400).json({
        error: 'A decision is either approved or rejected.' });
    }
    if (decision === 'rejected' && !String(note || '').trim()) {
      return res.status(400).json({
        error: 'Say why it is being turned down — the applicant is told this.' });
    }

    const r = await pool.query(
      'SELECT * FROM review_role_application($1, $2, $3, $4)',
      [req.params.id, decision, req.adminEmail, note || null]);

    await logAdminAction(req, `role.application.${decision}`, {
      application_id: req.params.id,
      kind: r.rows[0]?.kind,
      user_id: r.rows[0]?.user_id,
      note: note || null,
    });

    res.json(r.rows[0]);
  }));

  /**
   * Take a role back.
   *
   * 0087 gave the person resign_role() and the admin an approve, and nothing
   * in between -- an agent taking money and not delivering could only be
   * stopped by asking them to resign. This is that missing door, and it wants
   * a reason for the same reason an approval wants a name.
   */
  router.post('/revoke', handle(async (req: any, res: any) => {
    const { user_id, kind, reason } = req.body;

    if (!user_id || !kind) {
      return res.status(400).json({ error: 'Which person, and which role?' });
    }
    if (!String(reason || '').trim()) {
      return res.status(400).json({
        error: 'Say why this role is being taken away. It goes on the record.' });
    }

    await pool.query('SELECT revoke_role($1, $2, $3, $4)',
                     [user_id, kind, req.adminEmail, reason]);

    await logAdminAction(req, 'role.revoked', { user_id, kind, reason });
    res.json({ revoked: true, user_id, kind });
  }));

  /**
   * Everyone who currently holds one of these roles.
   *
   * The queue answers "who is asking". This answers "who is out there right
   * now", which is the question you need before revoking anybody and the one
   * the application list cannot tell you.
   */
  router.get('/holders', handle(async (req: any, res: any) => {
    const kind = String(req.query.kind || 'delivery_agent');
    const column = kind === 'transport_vendor'
      ? 'is_transport_vendor' : 'is_delivery_agent';

    // The column name is chosen from a two-value whitelist above, never
    // interpolated from the query string -- a column name cannot be a bound
    // parameter, so it must not come from a request.
    const r = await pool.query(`
      SELECT id AS user_id, full_name, username, avatar_url, phone_number,
             school_name, created_at AS joined_at,
             COALESCE(is_available_for_delivery, false) AS available
      FROM profiles
      WHERE ${column} = true
      ORDER BY full_name NULLS LAST
      LIMIT 500`);

    res.json(r.rows);
  }));

  return router;
}
