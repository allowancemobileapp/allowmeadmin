import { Router } from "express";
import { Pool } from "pg";
import { asAdmin } from "./asAdmin.js";

/**
 * Plus membership, administered.
 *
 * BUILT AGAINST docs/PAYMENTS.md IN THE APP REPO. §12 is binding:
 *
 *   MUST     grant with admin_grant_plus, revoke with admin_revoke_plus
 *   MUST     when revoke returns has_paystack_customer: true, tell the admin
 *            to cancel at Paystack -- the RPC does not, and the card keeps
 *            being charged until somebody does
 *   MUST     show subscription_expires_at, trial_source and
 *            paystack_customer_code on a member
 *   MUST NOT update profiles' billing columns directly -- a trigger refuses
 *            it, and if it ever did not, it would be a hole
 *
 * Nothing in this file writes to profiles. Every change is an RPC the
 * database gates on is_app_admin(). Reads use has_plus(), which §3.1 names
 * as the canonical "is this person Plus right now" -- the tier column alone
 * says nothing about expiry.
 */
export function createPlusRouter(pool: Pool) {
  const router = Router();

  const handle = (fn: any) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (e: any) {
      console.error('[plus]', e);
      if (e.code === '42883') {
        return res.status(400).json({
          error: 'The Plus RPCs are not in this database. See docs/PAYMENTS.md §5.',
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

  /** The reasons §5 says the RPCs return, each as its own sentence. */
  const REASONS: Record<string, (u: string, d?: number) => string> = {
    not_admin: () =>
      'This account is not in admin_users, so the database refused. Being '
      + 'signed in to the dashboard is not the same as being an app admin.',
    no_such_user: (u) =>
      `No user called @${u}. Check the spelling — it has to match a username exactly.`,
    days_out_of_range: (_u, d) =>
      `${d} days is outside the allowed range of 1 to 366.`,
  };

  const refuse = (res: any, out: any, username: string, days?: number) => {
    const fn = REASONS[out?.reason];
    return res.status(400).json({
      error: fn ? fn(username, days)
                : `The database refused that: ${out?.reason || 'no reason given'}.`,
      reason: out?.reason || null,
    });
  };

  /**
   * Everyone who is Plus right now, with the three fields §12 says explain
   * most support questions: when it ends, how they got it, and whether a
   * card is attached.
   *
   * profiles is SELECT USING (true) per §5, so this direct read is allowed.
   * The paystack_customer_code is returned as a boolean and a masked tail --
   * the full code is a Paystack identifier and nothing on this screen needs
   * it verbatim.
   */
  router.get('/members', handle(async (req: any, res: any) => {
    const q = String(req.query.q || '').trim().toLowerCase();

    const r = await pool.query(`
      SELECT p.id, p.username, p.full_name, p.avatar_url, p.email,
             p.subscription_tier, p.subscription_expires_at,
             p.trial_source, p.trial_ends_at,
             p.paystack_customer_code IS NOT NULL AS has_card,
             RIGHT(p.paystack_customer_code, 6)     AS card_tail,
             p.referred_by IS NOT NULL             AS was_referred,
             public.has_plus(p.id)                 AS is_plus,
             (SELECT COUNT(*) FROM membership_payments mp
               WHERE mp.user_id = p.id::text AND mp.amount > 0
                 AND mp.verification = 'gateway')  AS gateway_payments
      FROM profiles p
      WHERE public.has_plus(p.id)
         OR ($1 <> '' AND (lower(p.username) LIKE '%' || $1 || '%'
                           OR lower(p.full_name) LIKE '%' || $1 || '%'
                           OR lower(p.email) LIKE '%' || $1 || '%'))
      ORDER BY public.has_plus(p.id) DESC,
               p.subscription_expires_at NULLS FIRST
      LIMIT 300`, [q]);

    res.json(r.rows.map((m: any) => ({
      ...m,
      gateway_payments: Number(m.gateway_payments),
      // NULL expiry is permanent and reserved for the two admin accounts
      // (§3.1, §11.12). Said explicitly rather than rendered as a blank.
      permanent: m.is_plus && m.subscription_expires_at === null,
      days_left: m.subscription_expires_at
        ? Math.ceil((new Date(m.subscription_expires_at).getTime() - Date.now()) / 86400000)
        : null,
    })));
  }));

  /** Grant. Extends from the later of now and the current expiry (§5). */
  router.post('/grant', handle(async (req: any, res: any) => {
    const username = String(req.body?.username || '').trim().replace(/^@/, '');
    const days = Number(req.body?.days);

    if (!username) return res.status(400).json({ error: 'Which username?' });
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      return res.status(400).json({ error: 'Days has to be a whole number from 1 to 366.' });
    }

    const out = await asAdmin(pool, req.adminEmail, async (c) => {
      const r = await c.query('SELECT public.admin_grant_plus($1, $2) AS result',
                              [username, days]);
      return r.rows[0]?.result || {};
    });

    if (out.ok !== true) return refuse(res, out, username, days);

    await logAdminAction(req, 'plus.granted',
      { username: out.username, days, expires_at: out.expires_at, was: out.was });

    res.json({
      ok: true,
      username: out.username,
      expires_at: out.expires_at,
      was: out.was,
      // "Extended" and "granted" are different sentences. was is null for
      // somebody who had nothing; a date for somebody who was already Plus.
      extended: out.was !== null && out.was !== undefined,
    });
  }));

  /**
   * Revoke.
   *
   * THE WARNING IS NOT OPTIONAL. §5: admin_revoke_plus "does not touch
   * Paystack -- if has_paystack_customer is true, also cancel the
   * subscription or the card keeps being charged." §14: there is no admin
   * RPC to cancel somebody else's subscription, and cancel_subscription acts
   * on the caller's own email. So the dashboard's job is to make that
   * impossible to miss, which is what `must_cancel_at_paystack` is for.
   */
  router.post('/revoke', handle(async (req: any, res: any) => {
    const username = String(req.body?.username || '').trim().replace(/^@/, '');
    if (!username) return res.status(400).json({ error: 'Which username?' });

    const out = await asAdmin(pool, req.adminEmail, async (c) => {
      const r = await c.query('SELECT public.admin_revoke_plus($1) AS result',
                              [username]);
      return r.rows[0]?.result || {};
    });

    if (out.ok !== true) return refuse(res, out, username);

    await logAdminAction(req, 'plus.revoked',
      { username: out.username, has_paystack_customer: out.has_paystack_customer });

    res.json({
      ok: true,
      username: out.username,
      must_cancel_at_paystack: out.has_paystack_customer === true,
    });
  }));

  return router;
}
