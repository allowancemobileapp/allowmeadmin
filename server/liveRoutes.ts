import { Router } from "express";
import { Pool } from "pg";

/**
 * The live split, campus earnings, and named investors for round modelling.
 *
 * WHAT THE LIVE SPLIT IS AND IS NOT. It shows each shareholder's proportional
 * share of what has come in and of what has been kept. A share of income is
 * NOT a sum anyone may draw: profit reaches a shareholder only when it is
 * distributed by resolution or the company is sold. The page says so, because
 * a number next to somebody's name reads like a promise.
 */
export function createLiveRouter(pool: Pool) {
  const router = Router();

  const handle = (fn: any) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (e: any) {
      console.error("[live]", e);
      res.status(400).json({ error: e.message });
    }
  };

  const roleOf = async (email: string): Promise<string> => {
    const r = await pool.query(
      `SELECT role FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [email || '']);
    return r.rows[0]?.role || 'none';
  };

  const founderOnly = (fn: any) => handle(async (req: any, res: any) => {
    if (await roleOf(req.adminEmail) !== 'founder') {
      return res.status(403).json({ error: 'Only the founder can change this.' });
    }
    await fn(req, res);
  });

  /** Same period vocabulary as the rest of the module. */
  const range = (q: any) => {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const p = String(q.period || 'month');
    if (p === 'custom') {
      return {
        from: String(q.from || '1970-01-01'),
        to: String(q.to || iso(today)),
        label: `${q.from} to ${q.to}`,
      };
    }
    const start = new Date(today);
    let label = 'This month';
    if (p === 'today') { label = 'Today'; }
    else if (p === 'week') { start.setDate(today.getDate() - 6); label = 'Last 7 days'; }
    else if (p === 'month') { start.setDate(1); label = 'This month'; }
    else if (p === 'quarter') {
      start.setMonth(Math.floor(today.getMonth() / 3) * 3, 1); label = 'This quarter';
    }
    else if (p === 'year') { start.setMonth(0, 1); label = 'This year'; }
    else if (p === 'all') { return { from: '1970-01-01', to: iso(today), label: 'All time' }; }
    return { from: iso(start), to: iso(today), label };
  };

  // ---- The live split ----------------------------------------------------

  /**
   * Everyone's share, for a period. ONE connection, sequential queries.
   */
  router.get('/split', handle(async (req: any, res: any) => {
    const { from, to, label } = range(req.query);
    const role = await roleOf(req.adminEmail);

    const client = await pool.connect();
    try {
      const holders = await client.query(
        'SELECT * FROM stakeholder_earnings($1::date, $2::date)', [from, to]);

      const totals = await client.query(`
        SELECT
          COALESCE((SELECT SUM(amount) FROM company_income
                     WHERE received_at::date BETWEEN $1 AND $2), 0) AS income,
          COALESCE((SELECT COUNT(*) FROM company_income
                     WHERE received_at::date BETWEEN $1 AND $2), 0) AS payments,
          COALESCE((SELECT SUM(amount) FROM company_expenses
                     WHERE expense_date::date BETWEEN $1 AND $2), 0) AS spend`,
        [from, to]);

      const streams = await client.query(`
        SELECT stream, COALESCE(SUM(amount),0) AS total, COUNT(*) AS payments
        FROM company_income WHERE received_at::date BETWEEN $1 AND $2
        GROUP BY stream ORDER BY total DESC`, [from, to]);

      // What campus partners are owed comes off the top. It is not
      // shareholder money and must not appear inside anyone's share.
      const campus = await client.query(`
        SELECT COALESCE(SUM(se.company_share * ss.percent / 100.0), 0) AS owed
        FROM school_stakeholders ss
        JOIN school_earnings($1::date, $2::date) se ON se.school_id = ss.school_id
        WHERE ss.active
          AND ss.starts_on <= $2::date
          AND (ss.ends_on IS NULL OR ss.ends_on >= $1::date)`, [from, to]);

      const t = totals.rows[0];
      const income = Number(t.income || 0);
      const spend = Number(t.spend || 0);
      const owed = Number(campus.rows[0]?.owed || 0);

      res.json({
        period: { from, to, label },
        totals: {
          income,
          spend,
          retained: income - spend,
          payments: Number(t.payments || 0),
          campus_liability: owed,
          per_naira_note: 'Each holder receives this fraction of every naira.',
        },
        streams: streams.rows.map((s) => ({
          stream: s.stream,
          total: Number(s.total),
          payments: Number(s.payments),
        })),
        holders: holders.rows.map((h) => ({
          holder_id: h.holder_id,
          full_name: h.full_name,
          role_title: h.role_title,
          shares: Number(h.shares),
          ownership_pct: Number(h.ownership_pct),
          share_of_income: Number(h.share_of_income),
          share_of_profit: Number(h.share_of_profit),
          // Their slice of the next naira through the door.
          per_naira: Number(h.ownership_pct) / 100,
        })),
        // Everyone may see the split -- that is the point of it. Only the
        // founder sees what the company spent to get there.
        viewer_role: role,
      });
    } finally {
      client.release();
    }
  }));

  // ---- Campuses ----------------------------------------------------------

  router.get('/schools', handle(async (req: any, res: any) => {
    const { from, to, label } = range(req.query);
    const client = await pool.connect();
    try {
      const rows = await client.query(
        'SELECT * FROM school_earnings($1::date, $2::date)', [from, to]);
      const partners = await client.query(`
        SELECT ss.*, sh.full_name AS person_name, s.name AS school_name
        FROM school_stakeholders ss
        LEFT JOIN shareholders sh ON sh.id = ss.person_id
        LEFT JOIN schools s ON s.id = ss.school_id
        ORDER BY ss.active DESC, ss.created_at DESC`);

      const byId = new Map<string, any[]>();
      for (const p of partners.rows) {
        const k = String(p.school_id);
        if (!byId.has(k)) byId.set(k, []);
        byId.get(k)!.push({
          ...p,
          percent: Number(p.percent),
          // A tenure that has run out is not a live obligation.
          expired: !!p.ends_on && new Date(p.ends_on) < new Date(),
        });
      }

      res.json({
        period: { from, to, label },
        schools: rows.rows.map((r) => {
          const share = byId.get(String(r.school_id)) || [];
          const companyShare = Number(r.company_share || 0);
          const live = share.filter((p) => p.active && !p.expired);
          const owed = live.reduce((a, p) => a + companyShare * p.percent / 100, 0);
          return {
            school_id: r.school_id,
            school_name: r.school_name,
            payments: Number(r.payments),
            collected: Number(r.collected),
            company_share: companyShare,
            partners: share,
            owed_to_partners: owed,
            company_keeps: companyShare - owed,
          };
        }),
        unassigned_partners: partners.rows
          .filter((p) => p.school_id === null)
          .map((p) => ({ ...p, percent: Number(p.percent) })),
      });
    } finally {
      client.release();
    }
  }));

  router.post('/schools/partners', founderOnly(async (req: any, res: any) => {
    const { school_id, person_id, body_name, contact, kind, percent,
            starts_on, ends_on, note } = req.body;
    if (!person_id && !body_name?.trim()) {
      throw new Error('Name the person or the body this agreement is with.');
    }
    const pct = Number(percent);
    if (!(pct > 0 && pct <= 100)) throw new Error('Percent must be between 0 and 100.');

    const r = await pool.query(
      `INSERT INTO school_stakeholders
         (school_id, person_id, body_name, contact, kind, percent,
          starts_on, ends_on, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,current_date),$8,$9,$10)
       RETURNING *`,
      [school_id || null, person_id || null, body_name || null, contact || null,
       kind || 'student_association', pct, starts_on || null, ends_on || null,
       note || null, req.adminEmail]);
    res.status(201).json(r.rows[0]);
  }));

  router.put('/schools/partners/:id', founderOnly(async (req: any, res: any) => {
    const { percent, ends_on, active, note, kind, contact } = req.body;
    const r = await pool.query(
      `UPDATE school_stakeholders SET
         percent = COALESCE($1, percent),
         ends_on = COALESCE($2, ends_on),
         active  = COALESCE($3, active),
         note    = COALESCE($4, note),
         kind    = COALESCE($5, kind),
         contact = COALESCE($6, contact)
       WHERE id = $7 RETURNING *`,
      [percent ?? null, ends_on ?? null, active ?? null, note ?? null,
       kind ?? null, contact ?? null, req.params.id]);
    if (!r.rows[0]) throw new Error('No such agreement.');
    res.json(r.rows[0]);
  }));

  router.delete('/schools/partners/:id', founderOnly(async (req: any, res: any) => {
    // Ended, not deleted: what a campus was owed last term is a record.
    await pool.query(
      `UPDATE school_stakeholders
       SET active = false, ends_on = COALESCE(ends_on, current_date)
       WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  }));

  router.get('/schools/list', handle(async (_req: any, res: any) => {
    const r = await pool.query('SELECT id, name FROM schools ORDER BY name');
    res.json(r.rows);
  }));

  // ---- Modelled investors -----------------------------------------------

  router.get('/investors', handle(async (_req: any, res: any) => {
    const r = await pool.query(`
      SELECT mi.*, sh.full_name AS person_name, sh.role_title
      FROM model_investors mi
      LEFT JOIN shareholders sh ON sh.id = mi.person_id
      ORDER BY mi.created_at`);
    res.json(r.rows.map((i) => ({ ...i, amount: Number(i.amount) })));
  }));

  router.post('/investors', founderOnly(async (req: any, res: any) => {
    const { name, person_id, amount, is_test, note } = req.body;
    if (!name?.trim() && !person_id) throw new Error('Give the investor a name.');
    const r = await pool.query(
      `INSERT INTO model_investors (name, person_id, amount, is_test, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name?.trim() || 'Test investor', person_id || null,
       Math.round(Number(amount || 0)), is_test !== false, note || null,
       req.adminEmail]);
    res.status(201).json({ ...r.rows[0], amount: Number(r.rows[0].amount) });
  }));

  router.put('/investors/:id', founderOnly(async (req: any, res: any) => {
    const { name, amount, note, person_id } = req.body;
    const r = await pool.query(
      `UPDATE model_investors SET
         name = COALESCE($1, name),
         amount = COALESCE($2, amount),
         note = COALESCE($3, note),
         person_id = COALESCE($4, person_id)
       WHERE id = $5 RETURNING *`,
      [name ?? null, amount === undefined ? null : Math.round(Number(amount)),
       note ?? null, person_id ?? null, req.params.id]);
    if (!r.rows[0]) throw new Error('No such investor.');
    res.json({ ...r.rows[0], amount: Number(r.rows[0].amount) });
  }));

  router.delete('/investors/:id', founderOnly(async (req: any, res: any) => {
    await pool.query('DELETE FROM model_investors WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  }));

  return router;
}
