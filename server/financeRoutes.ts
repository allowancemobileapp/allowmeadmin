import { Router } from "express";
import { Pool } from "pg";

/**
 * The company's own books: income, expenses, ownership, valuation.
 *
 * TWO RULES THIS FILE KEEPS.
 *
 * 1. REVENUE COMES FROM company_income AND NOWHERE ELSE. That view is the one
 *    place a gateway column is converted from kobo to naira. Summing
 *    membership_payments or ticket_purchases directly is how the dashboard
 *    came to report gist and ticket revenue at one hundred times its real
 *    value for months, and a second implementation would eventually drift the
 *    same way.
 *
 * 2. EVERY DATE FILTER GOES THROUGH range(). One parser, so "this month" means
 *    the same thing on the summary, the chart, the shareholder page and the
 *    export -- and a downloaded balance sheet always agrees with the screen it
 *    was downloaded from.
 */
export function createFinanceRouter(pool: Pool) {
  const router = Router();

  const handleReq = (handler: any) => async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (e: any) {
      console.error("[finance]", e);
      res.status(500).json({ error: e.message });
    }
  };

  const logAdminAction = async (req: any, action: string, details: any) => {
    try {
      await pool.query(
        'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
        ['admin', req.adminEmail || 'unknown', action, JSON.stringify(details)]
      );
    } catch (e) { console.error('Failed to log admin action', e); }
  };

  /**
   * Turns ?period=month (or ?from=&to=) into two dates.
   *
   * Every caller binds the result as $1/$2, so this is not where injection is
   * prevented -- but a custom range is still parsed through Date and
   * re-serialised, so anything that is not a real date becomes the fallback
   * instead of reaching the query as typed.
   */
  const range = (q: any) => {
    const period = String(q.period || 'all');
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();

    if (period === 'custom') {
      // Parsed and re-serialised, so anything that is not a real date becomes
      // the fallback rather than reaching the database as typed.
      const f = new Date(String(q.from || ''));
      const t = new Date(String(q.to || ''));
      const from = isNaN(f.getTime()) ? '1970-01-01' : iso(f);
      const to = isNaN(t.getTime()) ? iso(today) : iso(t);
      return { from, to, label: `${from} to ${to}` };
    }

    const start = new Date(today);
    switch (period) {
      case 'today':
        break;
      case 'week':
        start.setDate(start.getDate() - 6);
        break;
      case 'month':
        start.setDate(1);
        break;
      case 'quarter':
        start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        start.setMonth(0, 1);
        break;
      case 'all':
      default:
        return { from: '1970-01-01', to: iso(today), label: 'All time' };
    }
    return {
      from: iso(start),
      to: iso(today),
      label: period.charAt(0).toUpperCase() + period.slice(1),
    };
  };

  // Every money figure the top of the page shows, in one query set so the
  // numbers on screen are all from the same instant and cannot disagree.

  /**
   * EVERYTHING THE PAGE NEEDS ON LOAD, IN ONE REQUEST, ON ONE CONNECTION.
   *
   * The page used to fire four requests in parallel (summary, timeseries,
   * cap-table, role). On Vercel those can land on four DIFFERENT function
   * instances, each with its own pool, and Supabase caps the whole project at
   * 15 client connections -- so capping each pool at 3 does not help when
   * there are five instances. That is what EMAXCONNSESSION was telling us.
   *
   * One request means one instance. pool.connect() once and running the
   * queries SEQUENTIALLY on that single client means one connection, no
   * matter how many queries are involved. Slower on paper; it is the
   * difference between loading and not loading.
   */
  router.get('/bootstrap', handleReq(async (req: any, res: any) => {
    const { from, to, label } = range(req.query);
    const client = await pool.connect();
    try {
      const q = (text: string, params: any[] = []) => client.query(text, params);

      const income = await q(`
        SELECT stream, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS payments
        FROM company_income WHERE received_at::date BETWEEN $1 AND $2
        GROUP BY stream ORDER BY total DESC`, [from, to]);

      const expenses = await q(`
        SELECT COALESCE(reason, 'Uncategorised') AS category,
               COALESCE(SUM(amount), 0) AS total, COUNT(*) AS entries
        FROM company_expenses WHERE expense_date::date BETWEEN $1 AND $2
        GROUP BY reason ORDER BY total DESC`, [from, to]);

      const totals = await q(`
        SELECT
          (SELECT COALESCE(SUM(amount), 0) FROM company_investments
            WHERE invested_on BETWEEN $1 AND $2 AND disposed_on IS NULL) AS invested,
          (SELECT COALESCE(SUM(COALESCE(current_value, amount)), 0)
             FROM company_investments WHERE disposed_on IS NULL) AS assets_worth,
          (SELECT COALESCE(SUM(amount), 0) FROM company_liabilities
            WHERE settled_on IS NULL) AS liabilities,
          (SELECT COALESCE(SUM(monthly_gross), 0) FROM staff_salaries
            WHERE ended_on IS NULL) AS payroll_monthly,
          (SELECT row_to_json(v) FROM (
              SELECT amount, valued_on, method, basis FROM company_valuations
              ORDER BY valued_on DESC, created_at DESC LIMIT 1) v) AS valuation,
          (SELECT COALESCE(SUM(amount), 0) FROM company_income
            WHERE received_at::date >= ($1::date - ($2::date - $1::date) - 1)
              AND received_at::date < $1::date) AS prior_income`, [from, to]);

      const series = await q(`
        WITH days AS (SELECT generate_series($1::date, $2::date, '1 day')::date AS day)
        SELECT d.day,
          COALESCE((SELECT SUM(amount) FROM company_income
                     WHERE received_at::date = d.day), 0) AS income,
          COALESCE((SELECT SUM(amount) FROM company_expenses
                     WHERE expense_date::date = d.day), 0) AS expenses
        FROM days d ORDER BY d.day`, [from, to]);

      const cap = await q('SELECT * FROM cap_table');

      const roleRow = await q(
        `SELECT role FROM finance_users
          WHERE lower(email) = lower($1) AND active`, [req.adminEmail || '']);

      const agg = totals.rows[0];
      const totalIncome = income.rows.reduce((a, r) => a + Number(r.total), 0);
      const totalExpense = expenses.rows.reduce((a, r) => a + Number(r.total), 0);
      const priorIncome = Number(agg.prior_income || 0);

      res.json({
        role: roleRow.rows[0]?.role || 'none',
        summary: {
          period: { from, to, label },
          streams: income.rows.map((r) => ({
            stream: r.stream, total: Number(r.total), payments: Number(r.payments),
          })),
          expense_categories: expenses.rows.map((r) => ({
            category: r.category, total: Number(r.total), entries: Number(r.entries),
          })),
          totals: {
            income: totalIncome,
            expenses: totalExpense,
            profit: totalIncome - totalExpense,
            margin_pct: totalIncome > 0
              ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0,
            invested: Number(agg.invested || 0),
            assets_worth: Number(agg.assets_worth || 0),
            liabilities: Number(agg.liabilities || 0),
            payroll_monthly: Number(agg.payroll_monthly || 0),
            prior_income: priorIncome,
            income_change_pct: priorIncome > 0
              ? ((totalIncome - priorIncome) / priorIncome) * 100 : null,
          },
          valuation: agg.valuation ? {
            amount: Number(agg.valuation.amount),
            valued_on: agg.valuation.valued_on,
            method: agg.valuation.method,
            basis: agg.valuation.basis,
          } : null,
        },
        series: series.rows.map((r) => ({
          day: r.day,
          income: Number(r.income),
          expenses: Number(r.expenses),
          profit: Number(r.income) - Number(r.expenses),
        })),
        capTable: {
          holders: cap.rows.map((r) => ({
            ...r,
            shares: Number(r.shares),
            votes: Number(r.votes),
            ownership_pct: Number(r.ownership_pct),
            voting_pct: Number(r.voting_pct),
            all_shares: Number(r.all_shares),
            all_votes: Number(r.all_votes),
          })),
        },
      });
    } finally {
      // ALWAYS. A leaked client is a connection nobody can reclaim until the
      // instance dies, and fifteen of those is the whole project down.
      client.release();
    }
  }));

  router.get('/summary', handleReq(async (req: any, res: any) => {
    const { from, to, label } = range(req.query);

    // THREE ROUND TRIPS, NOT SEVEN.
    //
    // Supabase caps us at 15 client connections and this page used to fire
    // about sixteen queries on first paint, which is how it hit
    // EMAXCONNSESSION. The two GROUP BY queries have to stay separate; every
    // remaining scalar folds into one statement, which is also three fewer
    // round trips to eu-central-1.
    const [income, expenses, totals] = await Promise.all([
      pool.query(`
        SELECT stream, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS payments
        FROM company_income
        WHERE received_at::date BETWEEN $1 AND $2
        GROUP BY stream ORDER BY total DESC
      `, [from, to]),

      pool.query(`
        SELECT COALESCE(reason, 'Uncategorised') AS category,
               COALESCE(SUM(amount), 0) AS total, COUNT(*) AS entries
        FROM company_expenses
        WHERE expense_date::date BETWEEN $1 AND $2
        GROUP BY reason ORDER BY total DESC
      `, [from, to]),

      pool.query(`
        SELECT
          (SELECT COALESCE(SUM(amount), 0) FROM company_investments
            WHERE invested_on BETWEEN $1 AND $2 AND disposed_on IS NULL)
            AS invested,
          -- Everything still owned, NOT just what was bought in this window.
          -- The card is labelled "Assets owned"; scoping it to the period
          -- made it read as zero on any range you had not bought something in.
          (SELECT COALESCE(SUM(COALESCE(current_value, amount)), 0)
             FROM company_investments WHERE disposed_on IS NULL)
            AS assets_worth,
          -- A debt does not stop existing because the date filter moved.
          (SELECT COALESCE(SUM(amount), 0) FROM company_liabilities
            WHERE settled_on IS NULL) AS liabilities,
          (SELECT COALESCE(SUM(monthly_gross), 0) FROM staff_salaries
            WHERE ended_on IS NULL) AS payroll_monthly,
          (SELECT row_to_json(v) FROM (
              SELECT amount, valued_on, method, basis FROM company_valuations
              ORDER BY valued_on DESC, created_at DESC LIMIT 1) v)
            AS valuation,
          -- The same length of window immediately before this one, so the
          -- page can say whether things are getting better or worse.
          (SELECT COALESCE(SUM(amount), 0) FROM company_income
            WHERE received_at::date >= ($1::date - ($2::date - $1::date) - 1)
              AND received_at::date < $1::date) AS prior_income
      `, [from, to]),
    ]);

    const agg = totals.rows[0];

    const totalIncome = income.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalExpense = expenses.rows.reduce((s, r) => s + Number(r.total), 0);
    const priorIncome = Number(agg.prior_income || 0);

    res.json({
      period: { from, to, label },
      streams: income.rows.map((r) => ({
        stream: r.stream,
        total: Number(r.total),
        payments: Number(r.payments),
      })),
      expense_categories: expenses.rows.map((r) => ({
        category: r.category,
        total: Number(r.total),
        entries: Number(r.entries),
      })),
      totals: {
        income: totalIncome,
        expenses: totalExpense,
        profit: totalIncome - totalExpense,
        margin_pct: totalIncome > 0
          ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0,
        invested: Number(agg.invested || 0),
        assets_worth: Number(agg.assets_worth || 0),
        liabilities: Number(agg.liabilities || 0),
        payroll_monthly: Number(agg.payroll_monthly || 0),
        prior_income: priorIncome,
        income_change_pct: priorIncome > 0
          ? ((totalIncome - priorIncome) / priorIncome) * 100 : null,
      },
      valuation: agg.valuation
        ? {
            amount: Number(agg.valuation.amount),
            valued_on: agg.valuation.valued_on,
            method: agg.valuation.method,
            basis: agg.valuation.basis,
          }
        : null,
    });
  }));

  // Day-by-day money in and out, for the chart.
  router.get('/timeseries', handleReq(async (req: any, res: any) => {
    const { from, to } = range(req.query);
    // generate_series gives a row for every day in the window, so a day with
    // no trade draws as a zero rather than the line skipping over it.
    const result = await pool.query(`
      WITH days AS (
        SELECT generate_series($1::date, $2::date, '1 day')::date AS day
      )
      SELECT
        d.day,
        COALESCE((SELECT SUM(amount) FROM company_income
                   WHERE received_at::date = d.day), 0) AS income,
        COALESCE((SELECT SUM(amount) FROM company_expenses
                   WHERE expense_date::date = d.day), 0) AS expenses
      FROM days d ORDER BY d.day
    `, [from, to]);

    res.json(result.rows.map((r) => ({
      day: r.day,
      income: Number(r.income),
      expenses: Number(r.expenses),
      profit: Number(r.income) - Number(r.expenses),
    })));
  }));

  // Every payment in the window, for the table and the CSV.
  router.get('/income', handleReq(async (req: any, res: any) => {
    const { from, to } = range(req.query);
    const stream = req.query.stream ? String(req.query.stream) : null;
    const result = await pool.query(`
      SELECT stream, source_id, amount, received_at, payer, reference
      FROM company_income
      WHERE received_at::date BETWEEN $1 AND $2
        AND ($3::text IS NULL OR stream = $3)
      ORDER BY received_at DESC
      LIMIT 2000
    `, [from, to, stream]);
    res.json(result.rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  }));

  // ---- Ownership -------------------------------------------------------

  router.get('/cap-table', handleReq(async (_req: any, res: any) => {
    const [rows, classes, safes] = await Promise.all([
      pool.query('SELECT * FROM cap_table'),
      pool.query('SELECT * FROM share_classes ORDER BY sort_order'),
      pool.query(`SELECT * FROM safes WHERE status = 'outstanding' ORDER BY signed_on`),
    ]);
    res.json({
      holders: rows.rows.map((r) => ({
        ...r,
        shares: Number(r.shares),
        votes: Number(r.votes),
        ownership_pct: Number(r.ownership_pct),
        voting_pct: Number(r.voting_pct),
        all_shares: Number(r.all_shares),
        all_votes: Number(r.all_votes),
      })),
      classes: classes.rows,
      // Outstanding SAFEs are not shares yet, so they are NOT in the cap
      // table -- they are returned beside it so the page can show what is
      // waiting to convert without it silently changing anyone's percentage.
      outstanding_safes: safes.rows.map((s) => ({
        ...s,
        amount: Number(s.amount),
        valuation_cap: s.valuation_cap ? Number(s.valuation_cap) : null,
        discount_pct: Number(s.discount_pct),
      })),
    });
  }));

  // Everybody's stake, what it is worth, and how it has moved.
  router.get('/stakeholders', handleReq(async (req: any, res: any) => {
    const { from, to } = range(req.query);

    const [cap, valuation, windowProfit, todayProfit, history] = await Promise.all([
      pool.query('SELECT * FROM cap_table'),
      pool.query(`SELECT amount FROM company_valuations
                  ORDER BY valued_on DESC, created_at DESC LIMIT 1`),
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(amount) FROM company_income
                     WHERE received_at::date BETWEEN $1 AND $2), 0)
        - COALESCE((SELECT SUM(amount) FROM company_expenses
                     WHERE expense_date::date BETWEEN $1 AND $2), 0) AS profit
      `, [from, to]),
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(amount) FROM company_income
                     WHERE received_at::date = current_date), 0)
        - COALESCE((SELECT SUM(amount) FROM company_expenses
                     WHERE expense_date::date = current_date), 0) AS profit
      `),
      pool.query(`
        SELECT shareholder_id, snapshot_date, stake_value, profit_share
        FROM stakeholder_snapshots
        WHERE snapshot_date BETWEEN $1 AND $2
        ORDER BY snapshot_date
      `, [from, to]),
    ]);

    const companyValue = Number(valuation.rows[0]?.amount || 0);
    const profit = Number(windowProfit.rows[0]?.profit || 0);
    const profitToday = Number(todayProfit.rows[0]?.profit || 0);

    const byHolder: Record<string, any[]> = {};
    for (const h of history.rows) {
      (byHolder[h.shareholder_id] ||= []).push({
        date: h.snapshot_date,
        value: Number(h.stake_value),
        profit: Number(h.profit_share),
      });
    }

    res.json({
      company_value: companyValue,
      period_profit: profit,
      profit_today: profitToday,
      holders: cap.rows.map((r) => {
        const pct = Number(r.ownership_pct) / 100;
        return {
          shareholder_id: r.shareholder_id,
          full_name: r.full_name,
          role_title: r.role_title,
          is_founder: r.is_founder,
          share_class: r.share_class,
          shares: Number(r.shares),
          ownership_pct: Number(r.ownership_pct),
          voting_pct: Number(r.voting_pct),
          stake_value: companyValue * pct,
          // Their slice of what the business actually made. This is the
          // number that makes the page worth opening every morning.
          earned_in_period: profit * pct,
          earned_today: profitToday * pct,
          history: byHolder[r.shareholder_id] || [],
        };
      }),
    });
  }));

  // ---- Writing things down --------------------------------------------

  router.get('/expenses', handleReq(async (req: any, res: any) => {
    const { from, to } = range(req.query);
    const r = await pool.query(`
      SELECT * FROM company_expenses
      WHERE expense_date::date BETWEEN $1 AND $2
      ORDER BY expense_date DESC`, [from, to]);
    res.json(r.rows);
  }));

  /**
   * Re-tag an expense.
   *
   * Everything logged before 0085 defaulted to 'other', which is not
   * deductible, so real costs sat outside Monthly Gross Profit and the
   * company looked more profitable than it was. There was no way to fix one
   * from the app -- now there is.
   */
  router.put('/expenses/:id', handleReq(async (req: any, res: any) => {
    const { category, title, reason, amount, expense_date } = req.body;
    const before = await pool.query(
      'SELECT * FROM company_expenses WHERE id = $1', [req.params.id]);
    if (!before.rows[0]) throw new Error('No such expense.');

    const r = await pool.query(
      `UPDATE company_expenses SET
         category = COALESCE($1, category),
         title = COALESCE($2, title),
         reason = COALESCE($3, reason),
         amount = COALESCE($4, amount),
         expense_date = COALESCE($5, expense_date)
       WHERE id = $6 RETURNING *`,
      [category ?? null, title ?? null, reason ?? null,
       amount ?? null, expense_date ?? null, req.params.id]);

    // Re-tagging changes a certified month's inputs, so it is auditable.
    try {
      await pool.query(
        `INSERT INTO finance_audit (actor, action, entity, entity_id, before, after)
         VALUES ($1,'expense.retag','company_expenses',$2,$3,$4)`,
        [req.adminEmail || 'unknown', String(req.params.id),
         JSON.stringify(before.rows[0]), JSON.stringify(r.rows[0])]);
    } catch (e) { /* audit table may not exist yet */ }

    res.json(r.rows[0]);
  }));

  router.post('/expenses', handleReq(async (req: any, res: any) => {
    const { title, reason, category, amount, expense_date, vendor,
            person_id } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: 'A title and an amount are required.' });
    }

    // THE DOUBLE-ENTRY TRAP THIS CLOSES. A salary logged here used to be a
    // loose expense with a typed description: the money left the books but
    // payroll_runs never heard about it, so the staff member stayed showing
    // as owed in full. If this is a salary for somebody who has an open
    // payroll month, it belongs on that month -- refused here, with the
    // months named, rather than silently filed as an unattached expense.
    if (category === 'payroll' && person_id) {
      const open = await pool.query(
        `SELECT payroll_run_id, month, outstanding
           FROM payroll_outstanding WHERE shareholder_id = $1
           ORDER BY month`, [person_id]);

      if (open.rows.length > 0) {
        const months = open.rows.map((o: any) =>
          new Date(o.month).toLocaleDateString('en-NG',
            { month: 'long', year: 'numeric' })).join(', ');
        return res.status(409).json({
          error: `That person still has unpaid payroll for ${months}. `
               + 'Record it against the month so the payroll register clears '
               + 'too -- logging it here would take the money out of the books '
               + 'and still show them as owed.',
          code: 'USE_PAYROLL',
          outstanding: open.rows.map((o: any) => ({
            payroll_run_id: o.payroll_run_id,
            month: o.month,
            outstanding: Number(o.outstanding),
          })),
        });
      }
    }

    const r = await pool.query(
      `INSERT INTO company_expenses
         (title, reason, category, amount, expense_date, vendor, person_id,
          approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, reason || category || 'Uncategorised', category || 'other', amount,
       expense_date || new Date().toISOString(), vendor || null,
       person_id || null, req.adminEmail]
    );
    await logAdminAction(req, 'finance.expense.add', { title, amount, person_id });
    res.status(201).json(r.rows[0]);
  }));

  /**
   * Who is still owed what, for the salary form's dropdowns.
   *
   * Two lists in one call: everybody who could be paid, and the payroll
   * months still open. The form needs both to decide whether a payment
   * settles a month or is a loose expense, and one round trip keeps the
   * serverless connection count down.
   */
  router.get('/payroll/people', handleReq(async (_req: any, res: any) => {
    const [people, outstanding] = await Promise.all([
      pool.query(`
        SELECT s.id, s.full_name, s.role_title, s.staff_role,
               s.is_founder, s.employment_status,
               (ps.shareholder_id IS NOT NULL) AS on_payroll
        FROM shareholders s
        LEFT JOIN pay_scales ps ON ps.shareholder_id = s.id
        WHERE s.exited_on IS NULL
        ORDER BY s.full_name`),
      pool.query('SELECT * FROM payroll_outstanding'),
    ]);

    const byPerson: Record<string, any[]> = {};
    for (const o of outstanding.rows) {
      (byPerson[o.shareholder_id] ||= []).push({
        payroll_run_id: o.payroll_run_id,
        month: o.month,
        cash_due: Number(o.cash_due),
        cash_paid: Number(o.cash_paid),
        outstanding: Number(o.outstanding),
        overdue: o.overdue,
      });
    }

    res.json(people.rows.map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      role_title: p.role_title || p.staff_role || null,
      on_payroll: p.on_payroll,
      is_founder: p.is_founder,
      outstanding: byPerson[p.id] || [],
      total_outstanding: (byPerson[p.id] || [])
        .reduce((a: number, m: any) => a + m.outstanding, 0),
    })));
  }));

  router.get('/investments', handleReq(async (_req: any, res: any) => {
    const r = await pool.query(
      'SELECT * FROM company_investments ORDER BY invested_on DESC');
    res.json(r.rows);
  }));

  router.post('/investments', handleReq(async (req: any, res: any) => {
    const { title, category, amount, invested_on, current_value, note } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: 'A title and an amount are required.' });
    }
    const r = await pool.query(
      `INSERT INTO company_investments
         (title, category, amount, invested_on, current_value, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, category || 'Other', amount, invested_on || new Date(),
       current_value || null, note || null, req.adminEmail]
    );
    await logAdminAction(req, 'finance.investment.add', { title, amount });
    res.status(201).json(r.rows[0]);
  }));

  router.get('/liabilities', handleReq(async (_req: any, res: any) => {
    const r = await pool.query(
      'SELECT * FROM company_liabilities ORDER BY settled_on NULLS FIRST, due_on');
    res.json(r.rows);
  }));

  router.post('/liabilities', handleReq(async (req: any, res: any) => {
    const { title, owed_to, amount, due_on, note } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: 'A title and an amount are required.' });
    }
    const r = await pool.query(
      `INSERT INTO company_liabilities (title, owed_to, amount, due_on, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, owed_to || null, amount, due_on || null, note || null]
    );
    await logAdminAction(req, 'finance.liability.add', { title, amount });
    res.status(201).json(r.rows[0]);
  }));

  router.get('/salaries', handleReq(async (_req: any, res: any) => {
    const r = await pool.query(
      'SELECT * FROM staff_salaries ORDER BY ended_on NULLS FIRST, monthly_gross DESC');
    res.json(r.rows);
  }));

  router.post('/salaries', handleReq(async (req: any, res: any) => {
    const { person_name, role_title, monthly_gross, shareholder_id, started_on } = req.body;
    if (!person_name) return res.status(400).json({ error: 'A name is required.' });
    const r = await pool.query(
      `INSERT INTO staff_salaries
         (person_name, role_title, monthly_gross, shareholder_id, started_on)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [person_name, role_title || null, monthly_gross || 0,
       shareholder_id || null, started_on || new Date()]
    );
    await logAdminAction(req, 'finance.salary.add', { person_name });
    res.status(201).json(r.rows[0]);
  }));

  router.get('/valuations', handleReq(async (_req: any, res: any) => {
    const r = await pool.query(
      'SELECT * FROM company_valuations ORDER BY valued_on DESC LIMIT 50');
    res.json(r.rows);
  }));

  router.post('/valuations', handleReq(async (req: any, res: any) => {
    const { amount, method, basis, valued_on, note } = req.body;
    if (!amount) return res.status(400).json({ error: 'An amount is required.' });
    const r = await pool.query(
      `INSERT INTO company_valuations
         (amount, method, basis, valued_on, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [amount, method || 'manual', basis || 'founder_estimate',
       valued_on || new Date(), note || null, req.adminEmail]
    );
    await logAdminAction(req, 'finance.valuation.set', { amount });
    res.status(201).json(r.rows[0]);
  }));

  // ---- The share price ---------------------------------------------------
  //
  // A company valuation is not the thing anybody agrees. A PRICE PER SHARE is
  // -- "N10 a share" -- and the valuation falls out of it. These two routes
  // let the price be set directly and derive the valuation from the register,
  // which is the direction the arithmetic actually runs. 0088 exists because
  // it was being done the other way round and a valuation two zeroes short
  // put every stake at a hundredth of its value.

  router.get('/share-price', handleReq(async (_req: any, res: any) => {
    const [now, history, par] = await Promise.all([
      pool.query(`SELECT public.shares_issued()      AS shares_issued,
                         public.current_share_price() AS price_per_share`),
      pool.query(`SELECT id, valued_on, company_value, shares_then,
                         price_per_share, basis, note, created_by
                    FROM public.share_price_history LIMIT 24`),
      pool.query(`SELECT MAX(nominal_value) AS par FROM public.share_classes`),
    ]);

    const sharesIssued = Number(now.rows[0]?.shares_issued || 0);
    const price = now.rows[0]?.price_per_share;
    const parValue = Number(par.rows[0]?.par || 0);

    res.json({
      shares_issued: sharesIssued,
      price_per_share: price === null || price === undefined ? null : Number(price),
      company_value: price ? Number(price) * sharesIssued : 0,
      par_value: parValue,
      // What the register says was paid in, so the page can say plainly
      // whether the price on screen is above or below it.
      share_capital: parValue * sharesIssued,
      history: history.rows.map((h: any) => ({
        id: h.id,
        valued_on: h.valued_on,
        company_value: Number(h.company_value),
        shares_then: Number(h.shares_then),
        price_per_share: h.price_per_share === null ? null : Number(h.price_per_share),
        basis: h.basis,
        note: h.note,
        created_by: h.created_by,
      })),
    });
  }));

  router.post('/share-price', handleReq(async (req: any, res: any) => {
    const { price_per_share, basis, valued_on, note } = req.body;
    const price = Number(price_per_share);

    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'A share price has to be a positive number.' });
    }

    try {
      const r = await pool.query(
        `SELECT * FROM public.set_share_price($1, $2, $3, $4, $5)`,
        [price, basis || 'founder_estimate', valued_on || new Date(),
         note || null, req.adminEmail]);

      await logAdminAction(req, 'finance.share_price.set',
        { price_per_share: price, basis, amount: r.rows[0]?.amount });

      const shares = await pool.query(
        `SELECT public.shares_issued($1::date) AS n`, [r.rows[0].valued_on]);

      return res.status(201).json({
        ...r.rows[0],
        amount: Number(r.rows[0].amount),
        price_per_share: price,
        shares_issued: Number(shares.rows[0]?.n || 0),
      });
    } catch (e: any) {
      // set_share_price refuses a price below par, and refuses to price a
      // company with no shares issued. Those are answers, not server faults,
      // so they come back as 400 with the wording the function chose rather
      // than as a 500 the page has to guess at.
      if (e.code === 'P0001' || e.code === '23514') {
        return res.status(400).json({ error: e.message });
      }
      if (e.code === '42883') {
        return res.status(400).json({
          error: 'set_share_price does not exist yet. Run '
               + 'migrations/0089_share_price.sql.',
        });
      }
      throw e;
    }
  }));

  // ---- SAFEs, entirely optional ----------------------------------------

  router.get('/safes', handleReq(async (_req: any, res: any) => {
    const r = await pool.query('SELECT * FROM safes ORDER BY signed_on DESC');
    res.json(r.rows);
  }));

  router.post('/safes', handleReq(async (req: any, res: any) => {
    const {
      investor_name, amount, valuation_cap, discount_pct,
      post_money, mfn, signed_on, note,
    } = req.body;
    if (!investor_name || !amount) {
      return res.status(400).json({ error: 'An investor and an amount are required.' });
    }
    const r = await pool.query(
      `INSERT INTO safes
         (investor_name, amount, valuation_cap, discount_pct, post_money,
          mfn, signed_on, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [investor_name, amount, valuation_cap || null, discount_pct || 0,
       post_money !== false, !!mfn, signed_on || new Date(), note || null]
    );
    await logAdminAction(req, 'finance.safe.add', { investor_name, amount });
    res.status(201).json(r.rows[0]);
  }));

  /**
   * What a round would do to the cap table. Nothing is written.
   *
   * The order matters and is the whole reason this is on the server: SAFEs
   * convert FIRST, then the option pool is created, then the new money comes
   * in. Doing the pool before the SAFEs, or the round before either, gives a
   * different answer to the same deal -- and the difference lands on the
   * founder.
   */
  router.post('/model-round', handleReq(async (req: any, res: any) => {
    const raise = Number(req.body.raise || 0);
    const preMoney = Number(req.body.pre_money || 0);
    const poolPct = Number(req.body.pool_pct || 0);
    const poolPreMoney = req.body.pool_pre_money !== false;
    const includeSafes = req.body.include_safes !== false;

    if (raise <= 0 || preMoney <= 0) {
      return res.status(400).json({ error: 'A raise and a pre-money valuation are required.' });
    }

    const cap = await pool.query('SELECT * FROM cap_table');
    if (cap.rows.length === 0) {
      return res.status(400).json({ error: 'There is nobody on the cap table yet.' });
    }

    let shares = cap.rows.map((r: any) => ({
      shareholder_id: r.shareholder_id,
      name: r.full_name,
      share_class: r.share_class,
      votes_per_share: Number(r.votes_per_share),
      before: Number(r.shares),
      after: Number(r.shares),
    }));

    const startingShares = shares.reduce((s, h) => s + h.before, 0);
    const postMoney = preMoney + raise;

    // 1. SAFEs convert. Each takes whichever price is kinder to the investor:
    //    the discount off this round, or the price implied by their cap.
    const safeRows = includeSafes
      ? (await pool.query(`SELECT * FROM safes WHERE status = 'outstanding'`)).rows
      : [];

    const roundPrice = preMoney / startingShares;
    let safeShares = 0;
    const safeDetail = safeRows.map((s: any) => {
      const amount = Number(s.amount);
      const discounted = roundPrice * (1 - Number(s.discount_pct) / 100);
      const capPrice = s.valuation_cap
        ? Number(s.valuation_cap) / startingShares
        : Infinity;
      const price = Math.min(discounted, capPrice);
      const issued = price > 0 ? Math.floor(amount / price) : 0;
      safeShares += issued;
      return {
        investor: s.investor_name,
        amount,
        price_paid: price,
        shares: issued,
        converted_on: s.valuation_cap && capPrice < discounted ? 'cap' : 'discount',
      };
    });

    // 2 & 3. The option pool and the new money.
    //
    // BOTH CASES END WITH A POOL OF poolPct. The difference is who pays for
    // it, and it is worth real money:
    //
    //   pre-money   the pool is carved out before the investor arrives, so
    //               the existing holders fund all of it. This is what an
    //               investor means by "10% pool, pre-money basis", and it is
    //               why they ask for it that way round.
    //   post-money  the pool comes out after, so the investor is diluted by
    //               it too.
    //
    // On a 1,000,000-share company raising 200m at 800m pre with a 10% pool,
    // the founder lands on 56.0% pre-money and 57.6% post-money. Same pool,
    // 1.6 points of the company.
    const afterSafes = startingShares + safeShares;
    const r = raise / postMoney;
    const poolFrac = poolPct / 100;

    // THE ROUND HAS TO FIT INSIDE 100% OF THE COMPANY.
    //
    // On a pre-money pool the existing holders keep their share COUNT and the
    // investor plus the pool take their percentages out of the final table, so
    // the maths divides by (1 - pool - r). Raising N520m at N10m pre-money
    // makes r = 0.981; add a 2% pool and that denominator goes NEGATIVE.
    //
    // The Math.max(0, ...) below was meant to guard that and instead made it
    // worse: a negative share count became zero, so the round applied nothing
    // and the screen reported a N520m raise with 0% dilution and a share price
    // of Infinity. A wrong answer that looks plausible is the worst kind.
    //
    // Refused with the arithmetic shown, because the fix is a judgement about
    // the deal -- raise less, or value the company higher -- and not something
    // to guess at.
    const investorPct = r * 100;
    if (poolPreMoney && (r + poolFrac) >= 1) {
      return res.status(400).json({
        error:
          `That round cannot exist. At a pre-money valuation of ` +
          `N${preMoney.toLocaleString('en-NG')} a raise of ` +
          `N${raise.toLocaleString('en-NG')} already buys ` +
          `${investorPct.toFixed(1)}% of the company, and a ${poolPct}% pool ` +
          `carved out before the round needs ${((r + poolFrac) * 100).toFixed(1)}% ` +
          `in total. Raise less, put the valuation higher, or move the pool to ` +
          `after the round.`,
      });
    }
    if (r >= 1) {
      return res.status(400).json({
        error:
          `A raise of N${raise.toLocaleString('en-NG')} against a pre-money of ` +
          `N${preMoney.toLocaleString('en-NG')} would sell more than the whole ` +
          `company. The investor would own ${investorPct.toFixed(1)}%.`,
      });
    }
    // Not refused, but worth saying out loud before it is signed.
    const controlWarning = investorPct > 50
      ? `This sells ${investorPct.toFixed(1)}% of the company. Above 50% the ` +
        `investor controls an ordinary resolution.`
      : null;

    let poolShares = 0;
    let investorShares = 0;
    let finalTotal = 0;

    if (poolPreMoney) {
      // Existing holders keep their share COUNT; the pool and the investor
      // take their percentages out of the final table.
      const target = afterSafes / (1 - poolFrac - r);
      poolShares = Math.max(0, Math.floor(poolFrac * target));
      investorShares = Math.max(0, Math.floor(r * target));
      finalTotal = afterSafes + poolShares + investorShares;
    } else {
      // The investor buys r of the company, then the pool dilutes everyone,
      // so the investor ends up with slightly less than r.
      const afterInvestment = afterSafes / (1 - r);
      investorShares = Math.max(0, Math.floor(r * afterInvestment));
      const beforePool = afterSafes + investorShares;
      poolShares = Math.max(0, Math.floor((beforePool * poolFrac) / (1 - poolFrac)));
      finalTotal = beforePool + poolShares;
    }

    const founderBefore = shares
      .filter((h) => h.share_class?.startsWith('Class A'))
      .reduce((s, h) => s + h.before, 0);

    res.json({
      inputs: { raise, pre_money: preMoney, post_money: postMoney,
                pool_pct: poolPct, pool_pre_money: poolPreMoney },
      // Guarded: investorShares is zero on a degenerate round, and
      // Infinity renders as N0.00 -- which is what made the bug above
      // look like a display problem rather than an arithmetic one.
      share_price: investorShares > 0 ? raise / investorShares : 0,
      control_warning: controlWarning,
      shares: {
        before: startingShares,
        from_safes: safeShares,
        from_pool: poolShares,
        to_investor: investorShares,
        after: finalTotal,
      },
      safes: safeDetail,
      holders: shares.map((h) => ({
        name: h.name,
        share_class: h.share_class,
        shares: h.after,
        before_pct: startingShares > 0 ? (h.before / startingShares) * 100 : 0,
        after_pct: finalTotal > 0 ? (h.after / finalTotal) * 100 : 0,
        dilution_pct:
          (startingShares > 0 ? (h.before / startingShares) * 100 : 0)
          - (finalTotal > 0 ? (h.after / finalTotal) * 100 : 0),
        value_after: finalTotal > 0 ? (h.after / finalTotal) * postMoney : 0,
      })),
      // Article 5 makes the Founder Permanent Chairman regardless, but the
      // 75% and 50% marks are where a shareholder vote stops being a
      // formality, so they are worth seeing before the deal is signed.
      founder_voting_after: (() => {
        const votesAfter = shares.reduce(
          (s, h) => s + h.after * h.votes_per_share, 0)
          + (safeShares + poolShares + investorShares) * 1;
        const founderVotes = founderBefore * 10;
        return (founderVotes / votesAfter) * 100;
      })(),
    });
  }));

  // ---- Shareholders and share movements --------------------------------

  router.get('/shareholders', handleReq(async (_req: any, res: any) => {
    const r = await pool.query(
      'SELECT * FROM shareholders ORDER BY is_founder DESC, full_name');
    res.json(r.rows);
  }));

  router.post('/shareholders', handleReq(async (req: any, res: any) => {
    const { full_name, email, role_title, is_founding_team } = req.body;
    if (!full_name) return res.status(400).json({ error: 'A name is required.' });
    const r = await pool.query(
      `INSERT INTO shareholders (full_name, email, role_title, is_founding_team)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [full_name, email || null, role_title || null, !!is_founding_team]
    );
    await logAdminAction(req, 'finance.shareholder.add', { full_name });
    res.status(201).json(r.rows[0]);
  }));

  router.post('/share-transactions', handleReq(async (req: any, res: any) => {
    const { shareholder_id, class_id, shares, kind, price_per_share,
            txn_date, note } = req.body;
    if (!shareholder_id || !class_id || !shares) {
      return res.status(400).json({ error: 'A shareholder, a class and a number of shares are required.' });
    }

    // Article 3(a): no Class A share may be ISSUED to anyone but the Founder.
    // Enforced here rather than left to whoever is filling in the form,
    // because a cap table that contradicts the Articles is worse than no cap
    // table -- it looks authoritative.
    const cls = await pool.query(
      'SELECT founder_only, name FROM share_classes WHERE id = $1', [class_id]);
    if (cls.rows[0]?.founder_only && kind === 'issue') {
      const holder = await pool.query(
        'SELECT is_founder FROM shareholders WHERE id = $1', [shareholder_id]);
      if (!holder.rows[0]?.is_founder) {
        return res.status(400).json({
          error: `${cls.rows[0].name} can only be issued to the Founder. `
               + `Article 3(b) allows it to reach a Founding Team Member by `
               + `transfer -- record that as a transfer, not an issue.`,
        });
      }
    }

    // Signed, so a holding is a SUM. Anything that reduces a holding is
    // stored negative whatever sign the form sent.
    const signed = ['transfer_out', 'buyback'].includes(kind)
      ? -Math.abs(Number(shares))
      : Math.abs(Number(shares));

    const r = await pool.query(
      `INSERT INTO share_transactions
         (shareholder_id, class_id, shares, kind, price_per_share, txn_date,
          note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [shareholder_id, class_id, signed, kind || 'issue', price_per_share || 0,
       txn_date || new Date(), note || null, req.adminEmail]
    );
    await logAdminAction(req, 'finance.shares.move',
      { shareholder_id, shares: signed, kind });
    res.status(201).json(r.rows[0]);
  }));

  // ---- Reports ---------------------------------------------------------

  /**
   * A balance sheet for the window, as data. The page turns it into a PDF or
   * a CSV; the arithmetic happens here so a downloaded sheet can never
   * disagree with the screen it came from.
   */
  router.get('/balance-sheet', handleReq(async (req: any, res: any) => {
    const { from, to, label } = range(req.query);

    const [income, expenses, assets, liabilities, valuation] = await Promise.all([
      pool.query(`SELECT stream, COALESCE(SUM(amount),0) AS total
                  FROM company_income WHERE received_at::date BETWEEN $1 AND $2
                  GROUP BY stream ORDER BY total DESC`, [from, to]),
      pool.query(`SELECT COALESCE(reason,'Uncategorised') AS category,
                         COALESCE(SUM(amount),0) AS total
                  FROM company_expenses WHERE expense_date::date BETWEEN $1 AND $2
                  GROUP BY reason ORDER BY total DESC`, [from, to]),
      pool.query(`SELECT title, category, amount, COALESCE(current_value, amount) AS worth
                  FROM company_investments WHERE disposed_on IS NULL
                  ORDER BY invested_on DESC`),
      pool.query(`SELECT title, owed_to, amount, due_on
                  FROM company_liabilities WHERE settled_on IS NULL
                  ORDER BY due_on NULLS LAST`),
      pool.query(`SELECT amount, valued_on FROM company_valuations
                  ORDER BY valued_on DESC, created_at DESC LIMIT 1`),
    ]);

    const totalIncome = income.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalExpense = expenses.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalAssets = assets.rows.reduce((s, r) => s + Number(r.worth), 0);
    const totalLiab = liabilities.rows.reduce((s, r) => s + Number(r.amount), 0);
    const retained = totalIncome - totalExpense;

    res.json({
      company: 'ALLOWANCE SAAS LTD',
      rc_number: 'RC 9615473',
      period: { from, to, label },
      generated_at: new Date().toISOString(),
      income: income.rows.map((r) => ({ stream: r.stream, total: Number(r.total) })),
      expenses: expenses.rows.map((r) => ({ category: r.category, total: Number(r.total) })),
      assets: assets.rows.map((r) => ({ ...r, amount: Number(r.amount), worth: Number(r.worth) })),
      liabilities: liabilities.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
      totals: {
        income: totalIncome,
        expenses: totalExpense,
        retained,
        assets: totalAssets,
        liabilities: totalLiab,
        // What is left for the shareholders once what is owed is paid.
        net_worth: totalAssets + retained - totalLiab,
        valuation: Number(valuation.rows[0]?.amount || 0),
      },
    });
  }));

  // Fills in any missing days so a new install has a chart immediately
  // instead of waiting for the nightly job to build one.
  router.post('/snapshot', handleReq(async (req: any, res: any) => {
    const days = Math.min(Number(req.body?.days || 1), 365);
    let written = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const r = await pool.query(
        'SELECT take_stakeholder_snapshot($1) AS n', [d.toISOString().slice(0, 10)]);
      written += Number(r.rows[0]?.n || 0);
    }
    res.json({ ok: true, rows: written, days });
  }));

  router.get('/settings', handleReq(async (_req: any, res: any) => {
    const r = await pool.query('SELECT * FROM company_settings ORDER BY key');
    res.json(r.rows.map((s) => ({ ...s, value: Number(s.value) })));
  }));

  router.put('/settings/:key', handleReq(async (req: any, res: any) => {
    const r = await pool.query(
      `UPDATE company_settings SET value = $1, updated_at = now(), updated_by = $2
       WHERE key = $3 RETURNING *`,
      [req.body.value, req.adminEmail, req.params.key]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'No such setting.' });
    await logAdminAction(req, 'finance.setting.change',
      { key: req.params.key, value: req.body.value });
    res.json(r.rows[0]);
  }));

  return router;
}
