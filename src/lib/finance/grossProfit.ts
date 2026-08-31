import { Kobo, assertKobo } from './money';

/**
 * MONTHLY GROSS PROFIT.
 *
 * This figure decides what four people are paid under signed contracts, and
 * the app is named in those contracts as the primary source of the
 * calculation. A mistake here is a contractual breach, not a bug.
 *
 *   Monthly Gross Profit =
 *       gross sums collected from all revenue sources in the calendar month
 *     - payment gateway / processing / settlement / transfer fees
 *     - sums payable to sellers, merchants and vendors as their share
 *     - direct third-party costs of delivering that revenue
 *         (hosting, database, storage, bandwidth, third-party API charges)
 *     - refunds, chargebacks and reversals settled in that month
 *
 * NOTHING ELSE IS DEDUCTED. Not salaries -- including the officers' own --
 * not marketing, not G&A, not professional fees, not tax, not depreciation,
 * not amortisation, not financing costs, not capex.
 *
 * That exclusion list is the part most likely to be got wrong by someone
 * later "tidying up" the formula, so it is enforced by the type: there is no
 * field on GrossProfitInputs for any of them.
 *
 * CASH BASIS. Revenue counts in the month the funds are COLLECTED, not
 * invoiced. Calendar months only.
 */

/** The only four deductions the contract permits. */
export interface GrossProfitInputs {
  /** Gross collected across every revenue stream, this calendar month. */
  collections: Kobo;
  /** Gateway, processing, settlement and transfer fees. */
  gatewayFees: Kobo;
  /** Sellers', merchants' and vendors' share. Never ours. */
  sellerPayouts: Kobo;
  /** Hosting, database, storage, bandwidth, third-party APIs. */
  directInfrastructure: Kobo;
  /** Refunds, chargebacks and reversals SETTLED in this month. */
  refunds: Kobo;
}

export interface GrossProfitResult extends GrossProfitInputs {
  totalDeductions: Kobo;
  grossProfit: Kobo;
}

export function computeGrossProfit(i: GrossProfitInputs): GrossProfitResult {
  assertKobo(i.collections, 'collections');
  assertKobo(i.gatewayFees, 'gatewayFees');
  assertKobo(i.sellerPayouts, 'sellerPayouts');
  assertKobo(i.directInfrastructure, 'directInfrastructure');
  assertKobo(i.refunds, 'refunds');

  const totalDeductions =
    i.gatewayFees + i.sellerPayouts + i.directInfrastructure + i.refunds;

  return {
    ...i,
    totalDeductions,
    // Deliberately allowed to go negative. A loss-making month is a real
    // outcome and clamping it at zero would quietly overstate the band.
    grossProfit: i.collections - totalDeductions,
  };
}

/**
 * Categories of spend, and whether each one reduces Monthly Gross Profit.
 *
 * Exported so the UI can colour-code the expense form from the same source
 * that the calculation uses. Two lists that have to be kept in step by hand
 * is how the wrong category ends up deducted and somebody is underpaid.
 */
export const EXPENSE_CATEGORIES = [
  { id: 'payment_processing', label: 'Payment processing',    deductible: true },
  { id: 'seller_payouts',     label: 'Seller / vendor share', deductible: true },
  { id: 'infrastructure',     label: 'Direct infrastructure', deductible: true },
  { id: 'refunds',            label: 'Refunds & chargebacks', deductible: true },
  { id: 'payroll',            label: 'Salaries & staff',      deductible: false },
  { id: 'marketing',          label: 'Marketing',             deductible: false },
  { id: 'g_and_a',            label: 'General & admin',       deductible: false },
  { id: 'professional',       label: 'Professional fees',     deductible: false },
  { id: 'tax',                label: 'Tax',                   deductible: false },
  { id: 'capex',              label: 'Capital expenditure',   deductible: false },
  { id: 'financing',          label: 'Financing costs',       deductible: false },
  { id: 'other',              label: 'Other',                 deductible: false },
] as const;

export type ExpenseCategoryId = typeof EXPENSE_CATEGORIES[number]['id'];

export const isDeductible = (id: string): boolean =>
  EXPENSE_CATEGORIES.find((c) => c.id === id)?.deductible ?? false;

/**
 * Maps a categorised expense ledger onto the four contractual deduction
 * buckets. Anything not deductible is dropped here rather than being summed
 * into an "other deductions" line that would silently reduce the officers'
 * pay.
 */
export function deductionsFromLedger(
  rows: { category: string; amount: Kobo }[],
): Omit<GrossProfitInputs, 'collections'> {
  const bucket = (id: ExpenseCategoryId) =>
    rows.filter((r) => r.category === id)
        .reduce((a, r) => a + r.amount, 0);

  return {
    gatewayFees: bucket('payment_processing'),
    sellerPayouts: bucket('seller_payouts'),
    directInfrastructure: bucket('infrastructure'),
    refunds: bucket('refunds'),
  };
}
