import { Router } from "express";
import { Pool } from "pg";

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
  const draftFor = async (month: string) => {
    const [rev, exp] = await Promise.all([
      pool.query(`
        SELECT stream,
               COALESCE(SUM(gross_collected),0) AS gross,
               COALESCE(SUM(gateway_fee),0)     AS gateway,
               COALESCE(SUM(seller_payout),0)   AS seller,
               COALESCE(SUM(direct_cost),0)     AS direct
        FROM revenue_entries
        WHERE date_trunc('month', collected_on) = date_trunc('month', $1::date)
        GROUP BY stream`, [month]),
      pool.query(`
        SELECT category, COALESCE(SUM(amount),0)::bigint AS amount
        FROM company_expenses
        WHERE date_trunc('month', expense_date) = date_trunc('month', $1::date)
        GROUP BY category`, [month]),
    ]);

    const streams = rev.rows.map((r) => ({
      stream: r.stream,
      gross: Number(r.gross),
      gateway: Number(r.gateway),
      seller: Number(r.seller),
      direct: Number(r.direct),
    }));

    const sum = (k: 'gross'|'gateway'|'seller'|'direct') =>
      streams.reduce((a, s) => a + s[k], 0);

    // company_expenses.amount is naira numeric (it predates this module), so
    // it is converted here rather than being trusted as kobo.
    const expenseBucket = (cat: string) =>
      Math.round(Number(exp.rows.find((r) => r.category === cat)?.amount || 0) * 100);

    const inputs = {
      collections: sum('gross'),
      // Fees can be recorded per transaction OR as an expense line. Both are
      // counted, because a company will do one or the other and losing either
      // would overstate gross profit and overpay.
      gatewayFees: sum('gateway') + expenseBucket('payment_processing'),
      sellerPayouts: sum('seller') + expenseBucket('seller_payouts'),
      directInfrastructure: sum('direct') + expenseBucket('infrastructure'),
      refunds: expenseBucket('refunds'),
    };

    const result = computeGrossProfit(inputs);
    return { result, breakdown: { streams, expenses: exp.rows, inputs } };
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

      const { result, breakdown } = await draftFor(month);

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

    const rows = r.rows.map((p) => ({
      ...p,
      full_salary: Number(p.full_salary),
      cash_due: Number(p.cash_due),
      cash_paid: Number(p.cash_paid),
      accrued: Number(p.accrued),
      extinguished: Number(p.extinguished),
      overdue: !p.paid_on && new Date(p.due_on) < new Date(),
    }));

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

    const amount = Number(req.body.amount ?? line.cash_due);
    const upd = await pool.query(`
      UPDATE payroll_runs SET cash_paid = $1, paid_on = COALESCE($2, current_date)
      WHERE id = $3 RETURNING *`,
      [amount, req.body.paid_on || null, req.params.id]);

    await audit(req, 'salary.pay', 'payroll_runs', req.params.id, line, upd.rows[0]);
    res.json(upd.rows[0]);
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
  router.get('/me', handle(async (req: any, res: any) => {
    const role = await roleOf(req.adminEmail);
    const u = await pool.query(
      `SELECT * FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [req.adminEmail]);
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
