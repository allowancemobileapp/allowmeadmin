import { Router } from "express";
import { Pool } from "pg";
import { asAdmin as asAdminShared } from "./asAdmin.js";

/**
 * Ambassador referral codes.
 *
 * WHY THESE GO THROUGH THE SERVER RATHER THAN supabase.rpc() IN THE BROWSER.
 * Both RPCs gate on is_app_admin(), which resolves the caller from
 * auth.uid() and auth.jwt()->>'email' -- a Supabase auth context. This
 * dashboard signs in with FIREBASE and holds no Supabase session at all, so a
 * direct browser call has no identity to offer: is_app_admin() returns false,
 * the list comes back empty and every write is refused as not_admin.
 * Confirmed against the live database rather than assumed.
 *
 * The other way to give the browser a Supabase identity is the service-role
 * key, and that key is exactly what was found leaking out of the client
 * bundle and had to be rotated. Putting it back to save a hop would undo
 * that.
 *
 * So the request arrives here with a Firebase token requireAdmin has already
 * verified, and this router hands the database the email it proved. That is
 * not a bypass -- is_app_admin() still decides, against admin_users, on the
 * server. It is the same check, given an identity it can read.
 */
export function createAmbassadorRouter(pool: Pool) {
  const router = Router();

  const handle = (fn: any) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (e: any) {
      console.error('[ambassadors]', e);
      if (e.code === '42883') {
        return res.status(400).json({
          error: 'The referral RPCs are not in this database. '
               + 'list_referral_ambassadors and set_referral_plus are expected.',
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

  // Shared with plusRoutes -- see asAdmin.ts for why this exists.
  const asAdmin = <T,>(email: string, fn: (c: any) => Promise<T>) =>
    asAdminShared(pool, email, fn);

  /** Am I allowed to see this page at all? */
  router.get('/access', handle(async (req: any, res: any) => {
    const ok = await asAdmin(req.adminEmail, async (c) => {
      const r = await c.query('SELECT public.is_app_admin() AS ok');
      return r.rows[0]?.ok === true;
    });
    res.json({ allowed: ok });
  }));

  /**
   * The ambassadors.
   *
   * Sorted by signups here rather than in the browser, so a page that loads
   * slowly still arrives in the right order.
   */
  router.get('/', handle(async (req: any, res: any) => {
    const rows = await asAdmin(req.adminEmail, async (c) => {
      const r = await c.query('SELECT * FROM public.list_referral_ambassadors()');
      return r.rows;
    });

    res.json(rows
      .map((a: any) => ({
        username: a.username,
        full_name: a.full_name,
        avatar_url: a.avatar_url,
        days: Number(a.days),
        signups: Number(a.signups),
        weeks_granted: Number(a.weeks_granted),
        paid_conversions: Number(a.paid_conversions),
      }))
      .sort((x: any, y: any) => y.signups - x.signups));
  }));

  /**
   * Promote a code, change its length, or switch it off with days = 0.
   *
   * The RPC's refusal reasons are passed through individually. "Something
   * went wrong" would leave somebody unable to tell a typo in a username from
   * not being an admin, which are different problems with different fixes.
   */
  router.post('/', handle(async (req: any, res: any) => {
    const username = String(req.body?.username || '').trim().replace(/^@/, '');
    const days = Number(req.body?.days);

    if (!username) {
      return res.status(400).json({ error: 'Which username?' });
    }
    if (!Number.isInteger(days)) {
      return res.status(400).json({ error: 'Days has to be a whole number.' });
    }

    const out = await asAdmin(req.adminEmail, async (c) => {
      const r = await c.query(
        'SELECT public.set_referral_plus($1, $2) AS result',
        [username, days]);
      return r.rows[0]?.result || {};
    });

    if (out.ok !== true) {
      const messages: Record<string, string> = {
        not_admin:
          'This account is not in admin_users, so the database refused the '
          + 'change. Being signed in to the dashboard is not the same as being '
          + 'an app admin.',
        no_such_user:
          `No user called @${username}. A referral code is a username, so it `
          + 'has to match one exactly — check the spelling.',
        days_out_of_range:
          `${days} days is outside the allowed range. It has to be between 0 `
          + 'and 90, where 0 turns the code back into an ordinary one.',
      };
      return res.status(400).json({
        error: messages[out.reason]
            || `The database refused that: ${out.reason || 'no reason given'}.`,
        reason: out.reason || null,
      });
    }

    await logAdminAction(req,
      days === 0 ? 'ambassador.code.disabled' : 'ambassador.code.set',
      { username: out.username, days: out.days });

    res.json({ ok: true, username: out.username, days: Number(out.days) });
  }));

  return router;
}
