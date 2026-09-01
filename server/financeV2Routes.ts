import { Router } from "express";
import { Pool } from "pg";
import multer from "multer";

// A receipt is a photo of a transfer or a bank PDF, not a video. 15MB is
// generous and stops a mis-drop filling the bucket.
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// THE SAME MODULE THE GOLDEN TESTS VERIFY.
//
// Not a second implementation that happens to agree today. If the band
// boundaries or the default-award rule are ever wrong here, `npm test` fails
// -- which is the only reason to trust a number that four salaries depend on.
import {
  computeGrossProfit, EXPENSE_CATEGORIES,
} from "../src/lib/finance/grossProfit.js";
import {
  bandFor, payFor, applyAccrual, band5TriggerMet, founderPaymentBlocked,
  paymentDueDate, PayScale,
} from "../src/lib/finance/payroll.js";
import {
  computeCapTable, assertCapTableInvariants, filingImpact,
  Holder, Holding, Movement,
} from "../src/lib/finance/capTable.js";
import {
  resolveAward, movementsFromAwards, AwardScheme, Challenge, Tranche,
  respondByDate, milestoneRecordingLocked, certifierIsValid,
} from "../src/lib/finance/milestones.js";

/**
 * Sections 3 to 9 of the v2 spec: the contractual half.
 *
 * Everything money-shaped crossing this boundary is KOBO as an integer. The
 * client formats for display; nothing here ever sees a naira float.
 */
export function createFinanceV2Router(pool: Pool) {
  const router = Router();

  const handle = (fn: any) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (e: any) {
      console.error("[finance-v2]", e);
      res.status(400).json({ error: e.message });
    }
  };

  /** Section 9: actor, timestamp, before and after, on everything that matters. */
  const audit = async (req: any, action: string, entity: string,
                       entityId: string | null, before: any, after: any) => {
    try {
      await pool.query(
        `INSERT INTO finance_audit (actor, action, entity, entity_id, before, after)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.adminEmail || 'unknown', action, entity, entityId,
         before ? JSON.stringify(before) : null,
         after ? JSON.stringify(after) : null]);
    } catch (e) { console.error('audit write failed', e); }
  };

  const roleOf = async (email: string): Promise<string> => {
    const r = await pool.query('SELECT finance_role($1) AS role', [email || '']);
    return r.rows[0]?.role || 'none';
  };

  /**
   * Supabase admin client for the private receipts bucket.
   *
   * The service-role key bypasses every row-level policy in the database, so
   * it is read from the environment and never committed. Same shape as the
   * contracts helper in peopleRoutes.ts, pointed at a different bucket.
   */
  const receipts = async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Receipt storage is not configured. Set SUPABASE_URL and '
        + 'SUPABASE_SERVICE_ROLE_KEY in your Vercel environment variables.');
    }
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key).storage.from('payroll-receipts');
  };

  /** Only the founder may certify, issue challenges or edit bands. */
  const founderOnly = (fn: any) => handle(async (req: any, res: any) => {
    const role = await roleOf(req.adminEmail);
    if (role !== 'founder') {
      return res.status(403).json({
        error: 'Only the founder can do this.' });
    }
    await fn(req, res);
  });

  // =========================================================================
  // Section 3 -- Monthly Gross Profit
  // =========================================================================

  /**
   * Builds the draft from the ledgers. Does not save.
   *
   * Cash basis: revenue counts in the month it was COLLECTED. Deductions are
   * the four contractual buckets and nothing else -- deductionsFromLedger
   * drops every non-deductible category rather than letting it through as an
   * "other" line that would quietly cut somebody's pay.
   */
  const draftFor = async (month: string, client?: any) => {
    // Runs on the caller's client when one is given, so certify() does not
    // hold a transaction open on one connection while opening another.
    const q = (text: string, params: any[] = []) =>
      (client ?? pool).query(text, params);

    // AUTOMATIC COLLECTIONS -- the six streams the app settles through
    // Paystack: membership, gist adverts, event tickets, premium groups,
    // store subscriptions, delivery commission.
    //
    // This used to be missing entirely, and it is almost all of the money.
    // Gross profit was built on revenue_entries alone, which nobody types
    // into, so it sat at zero -- Band 1 -- and Band 1 pays everyone nothing.
    const auto = await q(
      'SELECT * FROM month_collections_kobo($1::date)', [month]);

    // MANUAL entries. For revenue that does NOT flow through the app: an
    // offline sponsorship, a direct bank transfer. Anything settled through
    // Paystack is already in `auto` above, and recording it here as well
    // would double it.
    const rev = await q(`
      SELECT stream,
             COALESCE(SUM(gross_collected),0) AS gross,
             COALESCE(SUM(gateway_fee),0)     AS gateway,
             COALESCE(SUM(seller_payout),0)   AS seller,
             COALESCE(SUM(direct_cost),0)     AS direct
      FROM revenue_entries
      WHERE date_trunc('month', collected_on) = date_trunc('month', $1::date)
      GROUP BY stream`, [month]);

    const exp = await q(`
      SELECT category, COALESCE(SUM(amount),0) AS amount
      FROM company_expenses
      WHERE date_trunc('month', expense_date) = date_trunc('month', $1::date)
      GROUP BY category`, [month]);

    const autoStreams = auto.rows.map((r: any) => ({
      stream: r.stream,
      slug: r.slug,
      collected: Number(r.collected_kobo),
      // The organiser's / vendor's share. On tickets the company keeps a flat
      // N500 and the rest of the ticket price was never its money.
      thirdParty: Number(r.third_party_kobo),
      company: Number(r.company_kobo),
      payments: Number(r.payments),
      feeBasis: r.fee_basis,
      source: 'automatic' as const,
    }));

    const manualStreams = rev.rows.map((r: any) => ({
      stream: r.stream,
      slug: r.stream,
      collected: Number(r.gross),
      gateway: Number(r.gateway),
      seller: Number(r.seller),
      direct: Number(r.direct),
      source: 'manual' as const,
    }));

    const sumBy = (rows: any[], k: string) =>
      rows.reduce((a, x) => a + Number(x[k] || 0), 0);

    // company_expenses.amount is naira numeric -- it predates this module --
    // so it is converted to kobo here rather than being trusted as kobo.
    const expenseBucket = (cat: string) =>
      Math.round(Number(exp.rows.find((r: any) => r.category === cat)?.amount || 0) * 100);

    const inputs = {
      collections: sumBy(autoStreams, 'collected') + sumBy(manualStreams, 'collected'),
      // A fee can be recorded per transaction OR as an expense line. Both are
      // counted, because a company will do one or the other, and missing
      // either would overstate gross profit and overpay.
      gatewayFees: sumBy(manualStreams, 'gateway') + expenseBucket('payment_processing'),
      // Third-party share, counted the way clause 7.1(b) requires: the full
      // amount collected is revenue, and what belongs to somebody else comes
      // straight back off.
      sellerPayouts: sumBy(autoStreams, 'thirdParty')
                   + sumBy(manualStreams, 'seller')
                   + expenseBucket('seller_payouts'),
      directInfrastructure: sumBy(manualStreams, 'direct') + expenseBucket('infrastructure'),
      refunds: expenseBucket('refunds'),
    };

    const result = computeGrossProfit(inputs);
    return {
      result,
      breakdown: {
        // Kept apart on purpose: if the same money were ever entered by hand
        // as well as settled through the app, it shows up as two lines rather
        // than silently doubling the total.
        automatic: autoStreams,
        manual: manualStreams,
        expenses: exp.rows,
        inputs,
      },
    };
  };

  router.get('/gross-profit/draft', handle(async (req: any, res: any) => {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7)) + '-01';
    const { result, breakdown } = await draftFor(month);
    res.json({ month, ...result, band: bandFor(result.grossProfit).band, breakdown });
  }));

  router.get('/gross-profit', handle(async (_req: any, res: any) => {
    const r = await pool.query(`
      SELECT * FROM gross_profit_months ORDER BY month DESC, version DESC LIMIT 120`);
    res.json(r.rows.map((m) => ({
      ...m,
      collections: Number(m.collections),
      gateway_fees: Number(m.gateway_fees),
      seller_payouts: Number(m.seller_payouts),
      direct_infrastructure: Number(m.direct_infrastructure),
      refunds: Number(m.refunds),
      gross_profit: Number(m.gross_profit),
      band: bandFor(Number(m.gross_profit)).band,
    })));
  }));

  /**
   * Certify. Writes an immutable row and the payroll that follows from it.
   *
   * One transaction: a certified month with no payroll, or payroll with no
   * certified month, are both states somebody would have to unpick by hand.
   */
  router.post('/gross-profit/certify', founderOnly(async (req: any, res: any) => {
    const month = String(req.body.month).slice(0, 7) + '-01';
    const reason = req.body.correction_reason || null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM gross_profit_months
         WHERE month = $1 AND status = 'certified'`, [month]);

      if (existing.rows.length > 0 && !reason) {
        throw new Error(
          `${month.slice(0, 7)} is already certified. A correction needs a reason, `
          + `and is recorded as a new version -- the original stays visible.`);
      }

      const { result, breakdown } = await draftFor(month, client);

      const version = existing.rows.length > 0
        ? Number(existing.rows[0].version) + 1 : 1;

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE gross_profit_months SET status = 'superseded' WHERE id = $1`,
          [existing.rows[0].id]);
      }

      const ins = await client.query(`
        INSERT INTO gross_profit_months
          (month, version, collections, gateway_fees, seller_payouts,
           direct_infrastructure, refunds, gross_profit, breakdown, status,
           certified_by, certified_at, supersedes_id, correction_reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'certified',$10,now(),$11,$12)
        RETURNING *`,
        [month, version, result.collections, result.gatewayFees,
         result.sellerPayouts, result.directInfrastructure, result.refunds,
         result.grossProfit, JSON.stringify(breakdown), req.adminEmail,
         existing.rows[0]?.id || null, reason]);

      const gpRow = ins.rows[0];

      // Payroll for the month, from the certified figure.
      const scales = await client.query(`
        SELECT ps.*, s.full_name FROM pay_scales ps
        JOIN shareholders s ON s.id = ps.shareholder_id
        WHERE ps.active`);

      const d = new Date(month);
      const due = paymentDueDate(d.getUTCFullYear(), d.getUTCMonth());

      for (const p of scales.rows) {
        const line = payFor(p.scale as PayScale, result.grossProfit);

        const bal = await client.query(
          `SELECT COALESCE(SUM(amount),0)::bigint AS balance
           FROM deferred_salary_ledger
           WHERE shareholder_id = $1 AND kind <> 'cap_extinguished'`,
          [p.shareholder_id]);

        const applied = applyAccrual(
          p.scale as PayScale, Number(bal.rows[0].balance), line.accrual);

        await client.query(`
          INSERT INTO payroll_runs
            (month, shareholder_id, gross_profit_id, band, full_salary,
             cash_due, accrued, extinguished, due_on)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (month, shareholder_id) DO UPDATE SET
            gross_profit_id = EXCLUDED.gross_profit_id,
            band = EXCLUDED.band, cash_due = EXCLUDED.cash_due,
            accrued = EXCLUDED.accrued, extinguished = EXCLUDED.extinguished`,
          [month, p.shareholder_id, gpRow.id, line.band, line.fullSalary,
           line.cash, applied.accrued,
           line.extinguished + applied.extinguishedByCap, due]);

        if (applied.accrued > 0) {
          await client.query(`
            INSERT INTO deferred_salary_ledger
              (shareholder_id, entry_date, amount, kind, month, note, created_by)
            VALUES ($1,$2,$3,'accrual',$4,$5,$6)`,
            [p.shareholder_id, month, applied.accrued, month,
             `Band ${line.band} accrual`, req.adminEmail]);
        }
        // Recorded for the audit trail, never shown as owed.
        if (applied.extinguishedByCap > 0) {
          await client.query(`
            INSERT INTO deferred_salary_ledger
              (shareholder_id, entry_date, amount, kind, month, note, created_by)
            VALUES ($1,$2,$3,'cap_extinguished',$4,$5,$6)`,
            [p.shareholder_id, month, applied.extinguishedByCap, month,
             'Cap reached -- extinguished, not owed', req.adminEmail]);
        }
      }

      await client.query('COMMIT');
      await audit(req, 'certify', 'gross_profit_months', gpRow.id,
                  existing.rows[0] || null, gpRow);

      res.json({
        ...gpRow,
        gross_profit: Number(gpRow.gross_profit),
        band: bandFor(result.grossProfit).band,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // =========================================================================
  // Sections 4 and 5 -- payroll and deferred pay
  // =========================================================================

  router.get('/payroll', handle(async (req: any, res: any) => {
    const month = req.query.month
      ? String(req.query.month).slice(0, 7) + '-01' : null;
    const r = await pool.query(`
      SELECT pr.*, s.full_name, ps.scale
      FROM payroll_runs pr
      JOIN shareholders s ON s.id = pr.shareholder_id
      JOIN pay_scales ps ON ps.shareholder_id = pr.shareholder_id
      WHERE ($1::date IS NULL OR pr.month = $1)
      ORDER BY pr.month DESC, ps.scale, s.full_name`, [month]);

    // How many payments sit behind each line, so the row can offer "3
    // payments" without a request per person.
    const counts = await pool.query(`
      SELECT payroll_run_id, COUNT(*) AS n, MAX(paid_on) AS last_paid
      FROM payroll_payments
      WHERE voided_at IS NULL
      GROUP BY payroll_run_id`);
    const byRun = new Map(counts.rows.map((c) =>
      [c.payroll_run_id, { n: Number(c.n), last_paid: c.last_paid }]));

    const rows = r.rows.map((p) => {
      const paid = Number(p.cash_paid);
      const due = Number(p.cash_due);
      const seen = byRun.get(p.id);
      return {
        ...p,
        full_salary: Number(p.full_salary),
        cash_due: due,
        cash_paid: paid,
        accrued: Number(p.accrued),
        extinguished: Number(p.extinguished),
        // What is still owed for the month, so the form can default to it and
        // the row can say so without the client re-deriving it.
        outstanding: Math.max(0, due - paid),
        payment_count: seen?.n || 0,
        last_paid_on: seen?.last_paid || null,
        // Part-paid is its own state. Before this it was indistinguishable
        // from unpaid, because paid_on only flips when the month settles.
        part_paid: paid > 0 && paid < due,
        overdue: !p.paid_on && new Date(p.due_on) < new Date(),
      };
    });

    res.json(rows);
  }));

  /**
   * Mark a salary paid.
   *
   * The founder ranks LAST. His contract requires him to defer until every
   * other officer is paid in full for the period, so this BLOCKS rather than
   * warns -- a warning would be dismissed, and the breach would be his own.
   */
  router.post('/payroll/:id/pay', founderOnly(async (req: any, res: any) => {
    const row = await pool.query(`
      SELECT pr.*, ps.scale FROM payroll_runs pr
      JOIN pay_scales ps ON ps.shareholder_id = pr.shareholder_id
      WHERE pr.id = $1`, [req.params.id]);
    if (row.rows.length === 0) throw new Error('No such payroll line.');
    const line = row.rows[0];

    if (line.scale === 'founder') {
      const others = await pool.query(`
        SELECT s.full_name, pr.cash_due, pr.cash_paid
        FROM payroll_runs pr
        JOIN pay_scales ps ON ps.shareholder_id = pr.shareholder_id
        JOIN shareholders s ON s.id = pr.shareholder_id
        WHERE pr.month = $1 AND ps.scale = 'officer'`, [line.month]);

      const check = founderPaymentBlocked(others.rows.map((o) => ({
        name: o.full_name, due: Number(o.cash_due), paid: Number(o.cash_paid),
      })));

      if (check.blocked) {
        return res.status(409).json({
          error: 'The founder ranks last. These officers are still owed for '
               + 'this period: '
               + check.outstanding.map((o) =>
                   `${o.name} (${(o.shortfall / 100).toLocaleString()} naira)`).join(', '),
          outstanding: check.outstanding,
        });
      }
    }

    // Was: an UPDATE that overwrote cash_paid and set paid_on. That recorded
    // no date a person chose, no reference, no receipt, could hold only one
    // payment, and -- worst of the four -- wrote nothing to company_expenses,
    // so the largest thing the company spends money on never appeared in the
    // books. record_payroll_payment() does all of it in one transaction.
    const amount = Math.round(Number(req.body.amount ?? line.cash_due));

    try {
      const r = await pool.query(
        `SELECT * FROM record_payroll_payment($1, $2, $3, $4, $5, $6, $7)`,
        [req.params.id, amount, req.body.paid_on || null,
         req.body.method || 'bank_transfer', req.body.reference || null,
         req.body.note || null, req.adminEmail]);

      const run = await pool.query(
        'SELECT * FROM payroll_runs WHERE id = $1', [req.params.id]);

      await audit(req, 'salary.pay', 'payroll_runs', req.params.id,
                  line, { payment: r.rows[0], run: run.rows[0] });

      return res.status(201).json({
        payment: { ...r.rows[0], amount: Number(r.rows[0].amount) },
        run: {
          ...run.rows[0],
          cash_paid: Number(run.rows[0].cash_paid),
          cash_due: Number(run.rows[0].cash_due),
        },
      });
    } catch (e: any) {
      if (e.code === '42883') {
        return res.status(400).json({
          error: 'record_payroll_payment does not exist yet. Run '
               + 'migrations/0090_payroll_payments.sql.',
        });
      }
      throw e;
    }
  }));

  // ---- Payment history, receipts, and reversals --------------------------

  /**
   * Every payment behind one payroll line.
   *
   * A person can see their own; the founder can see anyone's. Nobody else can
   * see any -- the rows say what one named individual was paid.
   */
  router.get('/payroll/:id/payments', handle(async (req: any, res: any) => {
    const own = await pool.query(`
      SELECT pr.shareholder_id, s.login_email
      FROM payroll_runs pr
      LEFT JOIN shareholders s ON s.id = pr.shareholder_id
      WHERE pr.id = $1`, [req.params.id]);
    if (!own.rows[0]) throw new Error('No such payroll line.');

    const isFounder = await roleOf(req.adminEmail) === 'founder';
    const isSelf = (own.rows[0].login_email || '').toLowerCase()
                 === (req.adminEmail || '').toLowerCase();
    if (!isFounder && !isSelf) {
      return res.status(403).json({
        error: 'You can only see your own payment history.' });
    }

    const r = await pool.query(`
      SELECT id, amount, paid_on, method, reference, note,
             file_name, mime_type, size_bytes,
             storage_path IS NOT NULL AS has_receipt,
             expense_id, voided_at, voided_by, void_reason,
             created_at, created_by
      FROM payroll_payments
      WHERE payroll_run_id = $1
      ORDER BY paid_on DESC, created_at DESC`, [req.params.id]);

    res.json(r.rows.map((p) => ({
      ...p,
      amount: Number(p.amount),
      size_bytes: p.size_bytes === null ? null : Number(p.size_bytes),
    })));
  }));

  /** Attach the receipt to a payment already recorded. */
  router.post('/payroll/payments/:paymentId/receipt',
    (req: any, res: any, next: any) => {
      receiptUpload.single('file')(req, res, (err: any) => {
        if (err) return res.status(400).json({ error: 'Upload failed: ' + err.message });
        next();
      });
    },
    handle(async (req: any, res: any) => {
      if (await roleOf(req.adminEmail) !== 'founder') {
        return res.status(403).json({ error: 'Only the founder can attach receipts.' });
      }
      if (!req.file) throw new Error('No file was attached.');

      const existing = await pool.query(
        'SELECT id, storage_path, voided_at FROM payroll_payments WHERE id = $1',
        [req.params.paymentId]);
      if (!existing.rows[0]) throw new Error('No such payment.');
      if (existing.rows[0].voided_at) {
        throw new Error('That payment was reversed. Record a new one instead.');
      }

      const bucket = await receipts();
      // Namespaced by payment id, so a listing of the bucket cannot be walked
      // to read somebody else's receipt by guessing a timestamp.
      const safe = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${req.params.paymentId}/${Date.now()}_${safe}`;

      const { error } = await bucket.upload(path, req.file.buffer, {
        contentType: req.file.mimetype, upsert: false });
      if (error) throw new Error('Could not store the file: ' + error.message);

      // Replacing a receipt leaves the old object behind rather than deleting
      // it. Storage is cheap; a receipt destroyed by a mis-click is not
      // recoverable, and the row only ever points at the current one.
      const r = await pool.query(`
        UPDATE payroll_payments
        SET storage_path = $1, file_name = $2, mime_type = $3, size_bytes = $4
        WHERE id = $5
        RETURNING id, file_name, mime_type, size_bytes`,
        [path, req.file.originalname, req.file.mimetype, req.file.size,
         req.params.paymentId]);

      await audit(req, 'salary.receipt.upload', 'payroll_payments',
                  req.params.paymentId, null, { file: req.file.originalname });
      res.status(201).json(r.rows[0]);
    }));

  /**
   * A short-lived link to one receipt.
   *
   * Minted per request, expires in five minutes. The bucket is private, so
   * there is no permanent URL to leak and a link copied out of the page stops
   * working almost immediately.
   */
  router.get('/payroll/payments/:paymentId/receipt', handle(async (req: any, res: any) => {
    const r = await pool.query(`
      SELECT pp.storage_path, pp.file_name, s.login_email
      FROM payroll_payments pp
      LEFT JOIN shareholders s ON s.id = pp.shareholder_id
      WHERE pp.id = $1`, [req.params.paymentId]);
    if (!r.rows[0]) throw new Error('No such payment.');
    if (!r.rows[0].storage_path) throw new Error('No receipt was attached to that payment.');

    const isFounder = await roleOf(req.adminEmail) === 'founder';
    const isSelf = (r.rows[0].login_email || '').toLowerCase()
                 === (req.adminEmail || '').toLowerCase();
    if (!isFounder && !isSelf) {
      return res.status(403).json({ error: 'You can only open your own receipt.' });
    }

    const bucket = await receipts();
    const { data, error } = await bucket.createSignedUrl(r.rows[0].storage_path, 300);
    if (error) throw new Error('Could not create a link: ' + error.message);

    await audit(req, 'salary.receipt.view', 'payroll_payments',
                req.params.paymentId, null, null);
    res.json({ url: data.signedUrl, file_name: r.rows[0].file_name, expires_in: 300 });
  }));

  /**
   * Reverse a payment.
   *
   * A void, not a delete. The row stays and stops counting, because "entered
   * on the 3rd, reversed on the 5th" is itself part of the record. The
   * expense row goes, since an expense that never happened has no business in
   * the cash position.
   */
  router.post('/payroll/payments/:paymentId/void',
    founderOnly(async (req: any, res: any) => {
      const r = await pool.query(
        'SELECT * FROM void_payroll_payment($1, $2, $3)',
        [req.params.paymentId, req.body.reason || '', req.adminEmail]);

      await audit(req, 'salary.pay.void', 'payroll_payments',
                  req.params.paymentId, null, { reason: req.body.reason });
      res.json({ ...r.rows[0], amount: Number(r.rows[0].amount) });
    }));

  // ---- Does the app agree with the bank? ---------------------------------

  /**
   * The point of writing payroll into the expense ledger at all.
   *
   * A cash position nobody can check against a statement is a number to be
   * taken on faith. This returns both, and the gap.
   */
  router.get('/reconciliation', handle(async (req: any, res: any) => {
    const asOf = req.query.as_of ? String(req.query.as_of) : null;

    try {
      const [position, history, unrecorded] = await Promise.all([
        pool.query('SELECT * FROM cash_position(COALESCE($1::date, current_date))',
                   [asOf]),
        pool.query('SELECT * FROM bank_reconciliation LIMIT 24'),
        // Payroll that has been certified as due but never paid. It is the
        // most common reason the two figures differ, so the page can say so
        // instead of leaving the founder to work it out.
        pool.query(`
          SELECT COALESCE(SUM(cash_due - cash_paid), 0) AS unpaid_payroll
          FROM payroll_runs WHERE cash_paid < cash_due`),
      ]);

      const p = position.rows[0] || {};
      res.json({
        as_of: asOf || new Date().toISOString().slice(0, 10),
        // NAIRA throughout -- company_income and company_expenses are naira,
        // and cash_position() already divides capital_events out of kobo.
        income_in: Number(p.income_in || 0),
        capital_in: Number(p.capital_in || 0),
        expenses_out: Number(p.expenses_out || 0),
        app_says: Number(p.net_position || 0),
        // KOBO, because payroll_runs is kobo. Named so nobody has to guess.
        unpaid_payroll_kobo: Number(unrecorded.rows[0]?.unpaid_payroll || 0),
        history: history.rows.map((h) => ({
          as_of: h.as_of,
          account: h.account,
          bank_says: Number(h.bank_says),
          app_says: Number(h.app_says),
          difference: Number(h.difference),
          note: h.note,
        })),
      });
    } catch (e: any) {
      if (e.code === '42883' || e.code === '42P01') {
        return res.status(400).json({
          error: 'The reconciliation views do not exist yet. Run '
               + 'migrations/0090_payroll_payments.sql.',
        });
      }
      throw e;
    }
  }));

  /** What the bank statement says, typed off the statement. */
  router.post('/reconciliation', founderOnly(async (req: any, res: any) => {
    const { as_of, balance, account, note } = req.body;
    if (!as_of) throw new Error('Which date is this balance as at?');
    if (balance === undefined || balance === null || balance === '') {
      throw new Error('What does the statement say?');
    }

    const r = await pool.query(`
      INSERT INTO bank_balances (as_of, balance, account, note, created_by)
      VALUES ($1, $2, COALESCE($3, 'main'), $4, $5)
      ON CONFLICT (as_of, account) DO UPDATE
        SET balance = EXCLUDED.balance, note = EXCLUDED.note,
            created_by = EXCLUDED.created_by
      RETURNING *`,
      [as_of, Number(balance), account || 'main', note || null, req.adminEmail]);

    await audit(req, 'bank.balance.record', 'bank_balances', r.rows[0].id,
                null, r.rows[0]);
    res.status(201).json({ ...r.rows[0], balance: Number(r.rows[0].balance) });
  }));

  router.get('/deferred', handle(async (_req: any, res: any) => {
    const [balances, history] = await Promise.all([
      pool.query('SELECT * FROM deferred_balances ORDER BY full_name'),
      pool.query(`
        SELECT gp.month, gp.gross_profit FROM gross_profit_months gp
        WHERE gp.status = 'certified' ORDER BY gp.month DESC LIMIT 12`),
    ]);

    const gps = history.rows.map((h) => Number(h.gross_profit));

    res.json({
      balances: balances.rows.map((b) => ({
        ...b,
        balance: Number(b.balance),
        deferred_cap: Number(b.deferred_cap),
        total_accrued: Number(b.total_accrued),
        total_paid: Number(b.total_paid),
        at_cap: Number(b.balance) >= Number(b.deferred_cap),
      })),
      total_liability: balances.rows.reduce((a, b) => a + Number(b.balance), 0),
      triggers: {
        // Detected automatically from certified history (section 5).
        band5_three_months: band5TriggerMet(gps),
        // Manually flagged. The app cannot know about a sale.
        financing_note: 'Equity financing of 150,000,000 naira or more -- flag manually.',
        change_of_control_note: 'Sale or change of control -- flag manually.',
      },
    });
  }));

  router.get('/deferred/:shareholderId/statement', handle(async (req: any, res: any) => {
    const r = await pool.query(`
      SELECT * FROM deferred_salary_ledger
      WHERE shareholder_id = $1 ORDER BY entry_date, created_at`,
      [req.params.shareholderId]);
    res.json(r.rows.map((e) => ({ ...e, amount: Number(e.amount) })));
  }));

  router.post('/deferred/pay', founderOnly(async (req: any, res: any) => {
    const { shareholder_id, amount, note } = req.body;
    if (!shareholder_id || !amount) throw new Error('A person and an amount are required.');
    const r = await pool.query(`
      INSERT INTO deferred_salary_ledger
        (shareholder_id, amount, kind, note, created_by)
      VALUES ($1, $2, 'payment', $3, $4) RETURNING *`,
      [shareholder_id, -Math.abs(Number(amount)), note || null, req.adminEmail]);
    await audit(req, 'deferred.pay', 'deferred_salary_ledger', r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));

  // =========================================================================
  // Section 6 -- milestones and the three cap table views
  // =========================================================================

  const loadSchemes = async (): Promise<AwardScheme[]> => {
    const [schemes, challenges, tranches] = await Promise.all([
      pool.query(`
        SELECT a.*, s.full_name FROM award_schemes a
        JOIN shareholders s ON s.id = a.shareholder_id`),
      pool.query('SELECT * FROM award_challenges'),
      pool.query('SELECT * FROM award_tranches ORDER BY tranche_index'),
    ]);

    return schemes.rows.map((s): AwardScheme => ({
      id: s.id,
      holderId: s.shareholder_id,
      holderName: s.full_name,
      awardTotal: Number(s.award_total),
      classCode: s.class_code,
      mechanism: s.mechanism,
      transferFromHolderId: s.transfer_from_id || undefined,
      longstopDate: s.longstop_date,
      kind: s.kind,
      challenges: challenges.rows
        .filter((c) => c.scheme_id === s.id)
        .map((c): Challenge => ({
          id: c.id, description: c.description,
          acceptanceCriteria: c.acceptance_criteria || '',
          allocatedShares: Number(c.allocated_shares),
          issuedOn: c.issued_on, respondBy: c.respond_by,
          deliverBy: c.deliver_by, status: c.status,
          outcome: c.outcome, assessedBy: c.assessed_by, assessedOn: c.assessed_on,
        })),
      tranches: tranches.rows
        .filter((t) => t.scheme_id === s.id)
        .map((t): Tranche => ({
          id: t.id, index: t.tranche_index, shares: Number(t.shares),
          milestoneDescription: t.milestone_description,
          recordedOn: t.recorded_on, achieved: t.achieved,
          certifiedBy: t.certified_by, certifiedOn: t.certified_on,
        })),
    }));
  };

  const loadTable = async () => {
    const [holders, txns] = await Promise.all([
      pool.query('SELECT * FROM shareholders ORDER BY is_founder DESC, full_name'),
      pool.query(`
        SELECT st.shareholder_id, sc.name AS class_name, SUM(st.shares) AS shares
        FROM share_transactions st
        JOIN share_classes sc ON sc.id = st.class_id
        GROUP BY st.shareholder_id, sc.name HAVING SUM(st.shares) > 0`),
    ]);

    const hs: Holder[] = holders.rows.map((h) => ({
      id: h.id, name: h.full_name, role: h.role_title,
      isFounder: h.is_founder, isFoundingTeam: h.is_founding_team,
    }));
    const hd: Holding[] = txns.rows.map((t) => ({
      holderId: t.shareholder_id,
      classCode: String(t.class_name).startsWith('Class A') ? 'A' : 'B',
      shares: Number(t.shares),
    }));
    return { hs, hd };
  };

  /**
   * The cap table in one of three states.
   *
   *   current      what is registered today
   *   if_all_vest  every award resolved in full
   *   scenario     the caller picks which milestones land
   */
  router.get('/cap-table/:mode', handle(async (req: any, res: any) => {
    const mode = req.params.mode;
    const { hs, hd } = await loadTable();
    const schemes = await loadSchemes();

    let movements: Movement[] = [];
    if (mode === 'if_all_vest') {
      // Everything resolves: challenges complete, default awards land.
      const outcomes = schemes.map((s) => {
        const forced: AwardScheme = s.kind === 'tranche'
          ? { ...s, tranches: (s.tranches ?? []).map((t) => ({
              ...t, achieved: true, certifiedBy: t.certifiedBy || 'assumed' })) }
          : { ...s, challenges: (s.challenges ?? []).map((c) => ({
              ...c, status: 'completed' as const })) };
        return resolveAward(forced, true);
      });
      movements = movementsFromAwards(outcomes, schemes) as Movement[];
    } else if (mode === 'scenario') {
      const on: string[] = String(req.query.on || '').split(',').filter(Boolean);
      const outcomes = schemes
        .filter((s) => on.includes(s.id))
        .map((s) => resolveAward(s, true));
      movements = movementsFromAwards(outcomes, schemes) as Movement[];
    }

    const state = computeCapTable(hs, hd, movements);
    assertCapTableInvariants(state);

    res.json({
      mode,
      ...state,
      filing: filingImpact(movements),
      awards: schemes.map((s) => resolveAward(s, false)),
    });
  }));

  router.get('/awards', handle(async (_req: any, res: any) => {
    const schemes = await loadSchemes();
    res.json(schemes.map((s) => ({
      scheme: s,
      now: resolveAward(s, false),
      atLongstop: resolveAward(s, true),
      daysToLongstop: Math.ceil(
        (new Date(s.longstopDate).getTime() - Date.now()) / 86400000),
    })));
  }));

  router.post('/awards/:schemeId/challenges', founderOnly(async (req: any, res: any) => {
    const { description, acceptance_criteria, allocated_shares, deliver_by } = req.body;
    if (!description || !allocated_shares) {
      throw new Error('A description and a share allocation are required.');
    }

    // Allocating past the award total would produce a negative default award.
    const s = await pool.query(`
      SELECT a.award_total,
             COALESCE((SELECT SUM(allocated_shares) FROM award_challenges
                        WHERE scheme_id = a.id), 0) AS allocated
      FROM award_schemes a WHERE a.id = $1`, [req.params.schemeId]);
    if (s.rows.length === 0) throw new Error('No such scheme.');
    const remaining = Number(s.rows[0].award_total) - Number(s.rows[0].allocated);
    if (Number(allocated_shares) > remaining) {
      throw new Error(
        `Only ${remaining.toLocaleString()} shares are still unallocated on this scheme.`);
    }

    const issued = new Date().toISOString().slice(0, 10);
    const r = await pool.query(`
      INSERT INTO award_challenges
        (scheme_id, description, acceptance_criteria, allocated_shares,
         issued_on, respond_by, deliver_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.schemeId, description, acceptance_criteria || null,
       allocated_shares, issued, respondByDate(issued), deliver_by || null]);

    await audit(req, 'challenge.issue', 'award_challenges', r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));

  router.post('/challenges/:id/status', handle(async (req: any, res: any) => {
    const status = String(req.body.status);
    const valid = ['accepted','declined','completed','not_completed','expired'];
    if (!valid.includes(status)) throw new Error(`Unknown status ${status}.`);

    const before = await pool.query('SELECT * FROM award_challenges WHERE id = $1',
                                    [req.params.id]);
    if (before.rows.length === 0) throw new Error('No such challenge.');

    // An assessment is a founder decision; accept/decline belongs to the
    // person the challenge was issued to.
    if (['completed','not_completed'].includes(status)) {
      const role = await roleOf(req.adminEmail);
      if (role !== 'founder') {
        return res.status(403).json({ error: 'Only the founder can assess a challenge.' });
      }
    }

    const r = await pool.query(`
      UPDATE award_challenges
      SET status = $1, outcome = COALESCE($2, outcome),
          assessed_by = $3, assessed_on = current_date
      WHERE id = $4 RETURNING *`,
      [status, req.body.outcome || null, req.adminEmail, req.params.id]);

    await audit(req, `challenge.${status}`, 'award_challenges', req.params.id,
                before.rows[0], r.rows[0]);
    res.json(r.rows[0]);
  }));

  router.put('/tranches/:id', founderOnly(async (req: any, res: any) => {
    if (req.body.milestone_description !== undefined && milestoneRecordingLocked()) {
      throw new Error(
        'Milestones had to be recorded by 30 September 2026. The fields are locked.');
    }
    const before = await pool.query('SELECT * FROM award_tranches WHERE id = $1',
                                    [req.params.id]);
    const r = await pool.query(`
      UPDATE award_tranches
      SET milestone_description = COALESCE($1, milestone_description),
          recorded_on = CASE WHEN $1 IS NOT NULL AND recorded_on IS NULL
                             THEN current_date ELSE recorded_on END,
          achieved = COALESCE($2, achieved)
      WHERE id = $3 RETURNING *`,
      [req.body.milestone_description ?? null,
       req.body.achieved ?? null, req.params.id]);
    await audit(req, 'tranche.update', 'award_tranches', req.params.id,
                before.rows[0], r.rows[0]);
    res.json(r.rows[0]);
  }));

  /**
   * Certify a founder tranche.
   *
   * A director other than the founder. Checked here AND by a trigger on the
   * table -- this is the only route by which the founder's equity can vest,
   * so one guard is not enough.
   */
  router.post('/tranches/:id/certify', handle(async (req: any, res: any) => {
    const me = req.adminEmail;
    const users = await pool.query(
      `SELECT email, role, is_director, shareholder_id FROM finance_users WHERE active`);
    const directors = users.rows.filter((u) => u.is_director).map((u) => u.email);
    const founder = users.rows.find((u) => u.role === 'founder')?.email || '';

    if (!certifierIsValid(me, founder, directors)) {
      return res.status(403).json({
        error: 'A milestone must be certified by a director other than the '
             + 'person it awards shares to.' });
    }

    const before = await pool.query('SELECT * FROM award_tranches WHERE id = $1',
                                    [req.params.id]);
    const r = await pool.query(`
      UPDATE award_tranches
      SET certified_by = $1, certified_on = current_date, achieved = true
      WHERE id = $2 RETURNING *`, [me, req.params.id]);

    await audit(req, 'tranche.certify', 'award_tranches', req.params.id,
                before.rows[0], r.rows[0]);
    res.json(r.rows[0]);
  }));

  // =========================================================================
  // Section 7 -- revenue and capital
  // =========================================================================

  router.get('/expense-categories', handle(async (_req: any, res: any) => {
    res.json(EXPENSE_CATEGORIES);
  }));

  router.post('/revenue', handle(async (req: any, res: any) => {
    const { stream, collected_on, gross_collected, gateway_fee,
            seller_payout, direct_cost, source_ref, note } = req.body;
    const g = Number(gross_collected || 0);
    const net = g - Number(gateway_fee || 0) - Number(seller_payout || 0)
                  - Number(direct_cost || 0);
    const r = await pool.query(`
      INSERT INTO revenue_entries
        (stream, collected_on, gross_collected, gateway_fee, seller_payout,
         direct_cost, net, source_ref, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [stream, collected_on || new Date(), g, gateway_fee || 0,
       seller_payout || 0, direct_cost || 0, net, source_ref || null, note || null]);
    await audit(req, 'revenue.add', 'revenue_entries', r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));

  router.get('/revenue/by-stream', handle(async (req: any, res: any) => {
    const r = await pool.query(`
      SELECT stream,
             COALESCE(SUM(gross_collected),0) AS gross,
             COALESCE(SUM(gateway_fee),0)     AS gateway,
             COALESCE(SUM(seller_payout),0)   AS seller,
             COALESCE(SUM(direct_cost),0)     AS direct,
             COALESCE(SUM(net),0)             AS net,
             COUNT(*)                          AS entries
      FROM revenue_entries
      WHERE collected_on BETWEEN COALESCE($1::date, '1970-01-01')
                             AND COALESCE($2::date, current_date)
      GROUP BY stream ORDER BY net DESC`,
      [req.query.from || null, req.query.to || null]);

    res.json(r.rows.map((s) => {
      const gross = Number(s.gross), net = Number(s.net);
      return {
        stream: s.stream,
        gross, net,
        gateway: Number(s.gateway),
        seller: Number(s.seller),
        direct: Number(s.direct),
        entries: Number(s.entries),
        // Per-stream margin. The blended figure hides which product pays.
        margin_pct: gross > 0 ? (net / gross) * 100 : 0,
      };
    }));
  }));

  router.get('/capital', handle(async (_req: any, res: any) => {
    const r = await pool.query('SELECT * FROM capital_events ORDER BY received_on DESC');
    res.json(r.rows.map((c) => ({ ...c, amount: Number(c.amount) })));
  }));

  router.post('/capital', founderOnly(async (req: any, res: any) => {
    const { kind, counterparty, amount, received_on, repayable, note } = req.body;
    const r = await pool.query(`
      INSERT INTO capital_events
        (kind, counterparty, amount, received_on, repayable, note)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [kind, counterparty || null, amount, received_on || new Date(),
       !!repayable, note || null]);
    await audit(req, 'capital.add', 'capital_events', r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));

  // =========================================================================
  // Sections 8 and 9 -- stakeholder view, roles, audit
  // =========================================================================

  /**
   * One person's own figures, with the BASIS attached to every naira number.
   *
   * There is no share price. The company has never raised, and 10 naira is
   * par value -- a legal minimum, not a market value. Every figure below
   * carries what it is based on and when it was set, because the alternative
   * is showing a shareholder a number that looks like their net worth and is
   * not.
   */
  /**
   * Just the caller's role. ONE query.
   *
   * The page needs this on every load to decide which tabs to show, and it
   * used to get it from /me -- which runs eleven queries to build a full
   * stakeholder statement. That was most of the connection burst that hit
   * Supabase's 15-client cap.
   */
  router.get('/role', handle(async (req: any, res: any) => {
    const r = await pool.query(
      `SELECT role, is_director, shareholder_id IS NOT NULL AS linked
       FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [req.adminEmail || '']);
    res.json(r.rows[0] || { role: 'none', is_director: false, linked: false });
  }));

  router.get('/me', handle(async (req: any, res: any) => {
    // One lookup, not two -- roleOf() would have re-queried this same row.
    const u = await pool.query(
      `SELECT * FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [req.adminEmail]);
    const role = u.rows[0]?.role || 'none';
    if (u.rows.length === 0) return res.json({ role, linked: false });

    const sid = u.rows[0].shareholder_id;
    if (!sid) return res.json({ role, linked: false });

    const { hs, hd } = await loadTable();
    const state = computeCapTable(hs, hd);
    const me = state.holders.find((h) => h.holderId === sid);

    const [valuation, retained, deferred, payroll, schemes] = await Promise.all([
      pool.query(`SELECT amount, valued_on, basis FROM company_valuations
                  ORDER BY valued_on DESC, created_at DESC LIMIT 1`),
      pool.query(`SELECT COALESCE(SUM(gross_profit),0) AS retained
                  FROM gross_profit_months WHERE status = 'certified'`),
      pool.query(`SELECT * FROM deferred_balances WHERE shareholder_id = $1`, [sid]),
      pool.query(`SELECT * FROM payroll_runs WHERE shareholder_id = $1
                  ORDER BY month DESC LIMIT 12`, [sid]),
      loadSchemes(),
    ]);

    const pct = me ? me.economicPct / 100 : 0;
    const val = valuation.rows[0];
    const retainedKobo = Math.round(Number(retained.rows[0].retained));

    res.json({
      role,
      linked: true,
      holding: me ? {
        shares: me.totalShares,
        byClass: me.byClass,
        economicPct: me.economicPct,
        votingPct: me.votingPct,
      } : null,
      figures: [
        {
          key: 'paid_in',
          label: 'Amount paid in',
          amount: me?.paidInValue ?? 0,
          basis: 'Par value, 10 naira per share',
          asOf: null,
          movesWhen: 'Never. This is what was paid, not what it is worth.',
        },
        {
          key: 'notional',
          label: 'Notional value',
          amount: val ? Math.round(Number(val.amount) * pct) : 0,
          basis: val ? val.basis : 'no valuation set',
          asOf: val ? val.valued_on : null,
          movesWhen: 'Only when the board sets a new valuation.',
        },
        {
          key: 'retained_share',
          label: 'Share of retained profit',
          // Honest, and will be NEGATIVE while the company is loss-making.
          // Not hidden -- see the note on the stakeholder page.
          amount: Math.round(retainedKobo * pct),
          basis: 'Certified Monthly Gross Profit to date',
          asOf: new Date().toISOString().slice(0, 10),
          movesWhen: 'Every month, when gross profit is certified.',
        },
      ],
      deferred: deferred.rows[0]
        ? { balance: Number(deferred.rows[0].balance),
            cap: Number(deferred.rows[0].deferred_cap) }
        : null,
      payroll: payroll.rows.map((p) => ({
        ...p, cash_due: Number(p.cash_due), cash_paid: Number(p.cash_paid),
        accrued: Number(p.accrued),
      })),
      awards: schemes.filter((s) => s.holderId === sid).map((s) => ({
        scheme: s, progress: resolveAward(s, false),
        daysToLongstop: Math.ceil(
          (new Date(s.longstopDate).getTime() - Date.now()) / 86400000),
      })),
      disclaimer:
        'Shareholders are paid from distributable profit or on an exit, not '
        + 'from revenue. No distribution has been declared.',
    });
  }));

  router.get('/users', founderOnly(async (_req: any, res: any) => {
    const r = await pool.query(`
      SELECT fu.*, s.full_name FROM finance_users fu
      LEFT JOIN shareholders s ON s.id = fu.shareholder_id
      ORDER BY fu.role, fu.email`);
    res.json(r.rows);
  }));

  router.post('/users', founderOnly(async (req: any, res: any) => {
    const { email, shareholder_id, role, is_director } = req.body;
    if (!email) throw new Error('An email is required.');
    const r = await pool.query(`
      INSERT INTO finance_users (email, shareholder_id, role, is_director)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (email) DO UPDATE SET
        shareholder_id = EXCLUDED.shareholder_id, role = EXCLUDED.role,
        is_director = EXCLUDED.is_director
      RETURNING *`,
      [email, shareholder_id || null, role || 'stakeholder', !!is_director]);
    await audit(req, 'role.change', 'finance_users', r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));

  router.get('/audit', founderOnly(async (req: any, res: any) => {
    const r = await pool.query(
      'SELECT * FROM finance_audit ORDER BY at DESC LIMIT $1',
      [Math.min(Number(req.query.limit || 200), 1000)]);
    res.json(r.rows);
  }));

  /**
   * Editing a salary band is a contractual change and needs a recorded
   * shareholder resolution. The reference is demanded here, not just in a
   * confirm dialog, because a dialog can be clicked through.
   */
  router.put('/pay-scales/:shareholderId', founderOnly(async (req: any, res: any) => {
    const { full_salary, deferred_cap, min_instalment, resolution_ref } = req.body;
    if (!resolution_ref || String(resolution_ref).trim().length < 3) {
      throw new Error(
        'Salary bands are contractual. Record the shareholder resolution '
        + 'reference that authorises this change.');
    }
    const before = await pool.query(
      'SELECT * FROM pay_scales WHERE shareholder_id = $1', [req.params.shareholderId]);
    const r = await pool.query(`
      UPDATE pay_scales SET
        full_salary = COALESCE($1, full_salary),
        deferred_cap = COALESCE($2, deferred_cap),
        min_instalment = COALESCE($3, min_instalment),
        resolution_ref = $4, updated_at = now()
      WHERE shareholder_id = $5 RETURNING *`,
      [full_salary ?? null, deferred_cap ?? null, min_instalment ?? null,
       resolution_ref, req.params.shareholderId]);
    await audit(req, 'band.edit', 'pay_scales', req.params.shareholderId,
                before.rows[0], r.rows[0]);
    res.json(r.rows[0]);
  }));

  return router;
}
