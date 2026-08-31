import { Kobo, naira, half } from './money';

/**
 * PAYROLL AND THE DEFERRED SALARY ACCOUNT.
 *
 * Cash pay is a step function of the month's CERTIFIED Monthly Gross Profit.
 * Half of whatever is not paid in cash accrues as a liability; the other half
 * is extinguished permanently and must never be shown as owed.
 *
 * Bands are per month and independent. A good month creates no entitlement
 * the following month, and a bad one creates no clawback.
 */

export type PayScale = 'officer' | 'founder';

export interface Band {
  band: 1 | 2 | 3 | 4 | 5;
  /** Inclusive. N1,500,000 exactly is Band 2; N7,000,000 exactly is Band 5. */
  minGrossProfit: Kobo;
  /** null on the top band -- there is no ceiling. */
  maxGrossProfit: Kobo | null;
  officerCash: Kobo;
  founderCash: Kobo;
}

export const FULL_SALARY: Record<PayScale, Kobo> = {
  officer: naira(400_000),
  founder: naira(600_000),
};

export const DEFERRED_CAP: Record<PayScale, Kobo> = {
  officer: naira(1_000_000),
  founder: naira(1_500_000),
};

/** Minimum instalment once the Band 5 payment trigger fires. */
export const MIN_INSTALMENT: Record<PayScale, Kobo> = {
  officer: naira(100_000),
  founder: naira(150_000),
};

export const BANDS: Band[] = [
  { band: 1, minGrossProfit: 0,                  maxGrossProfit: naira(1_499_999),
    officerCash: 0,                founderCash: 0 },
  { band: 2, minGrossProfit: naira(1_500_000),   maxGrossProfit: naira(2_999_999),
    officerCash: naira(100_000),   founderCash: naira(150_000) },
  { band: 3, minGrossProfit: naira(3_000_000),   maxGrossProfit: naira(4_499_999),
    officerCash: naira(200_000),   founderCash: naira(300_000) },
  { band: 4, minGrossProfit: naira(4_500_000),   maxGrossProfit: naira(6_999_999),
    officerCash: naira(300_000),   founderCash: naira(450_000) },
  { band: 5, minGrossProfit: naira(7_000_000),   maxGrossProfit: null,
    officerCash: naira(400_000),   founderCash: naira(600_000) },
];

/**
 * Which band a month falls into.
 *
 * A negative gross profit is Band 1, not an error. Loss-making months happen
 * and the contract simply pays nothing in them.
 */
export function bandFor(grossProfit: Kobo): Band {
  for (let i = BANDS.length - 1; i >= 0; i--) {
    if (grossProfit >= BANDS[i].minGrossProfit) return BANDS[i];
  }
  return BANDS[0];
}

export interface PayLine {
  scale: PayScale;
  band: 1 | 2 | 3 | 4 | 5;
  fullSalary: Kobo;
  cash: Kobo;
  /** Half the shortfall. The other half is extinguished, not owed. */
  accrual: Kobo;
  extinguished: Kobo;
}

export function payFor(scale: PayScale, grossProfit: Kobo): PayLine {
  const b = bandFor(grossProfit);
  const full = FULL_SALARY[scale];
  const cash = scale === 'founder' ? b.founderCash : b.officerCash;
  const shortfall = full - cash;
  const accrual = half(shortfall);

  return {
    scale,
    band: b.band,
    fullSalary: full,
    cash,
    accrual,
    extinguished: shortfall - accrual,
  };
}

/**
 * Applies a month's accrual against a running balance, respecting the cap.
 *
 * Once the cap is reached, accrual stops PERMANENTLY -- later shortfalls
 * extinguish entirely. The partial month at the boundary accrues only the
 * headroom, so the balance lands exactly on the cap rather than passing it.
 */
export function applyAccrual(
  scale: PayScale,
  currentBalance: Kobo,
  monthAccrual: Kobo,
): { accrued: Kobo; newBalance: Kobo; extinguishedByCap: Kobo } {
  const cap = DEFERRED_CAP[scale];
  const headroom = Math.max(0, cap - currentBalance);
  const accrued = Math.min(monthAccrual, headroom);
  return {
    accrued,
    newBalance: currentBalance + accrued,
    extinguishedByCap: monthAccrual - accrued,
  };
}

/**
 * Payment trigger 1: Band 5 for three consecutive months.
 *
 * Reads the history newest-first and only looks at the three most recent
 * months, because the trigger is about the CURRENT run. Three good months
 * last year followed by a bad one does not fire it.
 */
export function band5TriggerMet(
  certifiedGrossProfitsNewestFirst: Kobo[],
): boolean {
  if (certifiedGrossProfitsNewestFirst.length < 3) return false;
  return certifiedGrossProfitsNewestFirst
    .slice(0, 3)
    .every((gp) => bandFor(gp).band === 5);
}

/** Payment trigger 2: an equity financing raising N150,000,000 or more. */
export const FINANCING_TRIGGER = naira(150_000_000);
export const financingTriggerMet = (raised: Kobo): boolean =>
  raised >= FINANCING_TRIGGER;

/**
 * Whether the founder may be paid this month.
 *
 * His contract ranks him LAST: he defers until every other employee is paid
 * in full for the period. The app blocks rather than warns, because the
 * warning would be dismissed and the breach is his own.
 */
export function founderPaymentBlocked(
  officerPayments: { name: string; due: Kobo; paid: Kobo }[],
): { blocked: boolean; outstanding: { name: string; shortfall: Kobo }[] } {
  const outstanding = officerPayments
    .filter((o) => o.paid < o.due)
    .map((o) => ({ name: o.name, shortfall: o.due - o.paid }));
  return { blocked: outstanding.length > 0, outstanding };
}

/** Salary is due by the 10th of the following month. */
export function paymentDueDate(year: number, monthIndex0: number): Date {
  return new Date(Date.UTC(year, monthIndex0 + 1, 10));
}

export function isOverdue(year: number, monthIndex0: number, now = new Date()): boolean {
  return now > paymentDueDate(year, monthIndex0);
}
