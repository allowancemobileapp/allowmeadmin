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

  router.post('/expenses', handleReq(async (req: any, res: any) => {
    const { title, reason, category, amount, expense_date, vendor } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: 'A title and an amount are required.' });
    }
    const r = await pool.query(
      `INSERT INTO company_expenses
         (title, reason, category, amount, expense_date, vendor, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, reason || category || 'Uncategorised', category || 'other', amount,
       expense_date || new Date().toISOString(), vendor || null, req.adminEmail]
    );
    await logAdminAction(req, 'finance.expense.add', { title, amount });
    res.status(201).json(r.rows[0]);
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
      share_price: raise / investorShares,
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
        before_pct: (h.before / startingShares) * 100,
        after_pct: (h.after / finalTotal) * 100,
        dilution_pct:
          (h.before / startingShares) * 100 - (h.after / finalTotal) * 100,
        value_after: (h.after / finalTotal) * postMoney,
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
