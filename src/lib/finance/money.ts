/**
 * Money is an integer number of KOBO. Never a float, never naira.
 *
 * 0.1 + 0.2 !== 0.3 in binary floating point, and these numbers decide what
 * four people are paid under signed contracts. A rounding drift of a tenth of
 * a kobo is a contractual dispute, not a display bug.
 *
 * JS integers are exact to 2^53, which is about N90 trillion in kobo. That is
 * several orders of magnitude past anything this company will hold.
 */
export type Kobo = number;

export const naira = (n: number): Kobo => Math.round(n * 100);
export const toNaira = (k: Kobo): number => k / 100;

export const formatNaira = (k: Kobo): string =>
  'N' + (k / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Guards against a fraction sneaking in from an API or a form. */
export function assertKobo(k: number, what = 'amount'): Kobo {
  if (!Number.isInteger(k)) {
    throw new Error(`${what} must be a whole number of kobo, got ${k}`);
  }
  if (!Number.isSafeInteger(k)) {
    throw new Error(`${what} is beyond safe integer range: ${k}`);
  }
  return k;
}

/**
 * Half of a shortfall, rounded DOWN.
 *
 * Deferred pay accrues at 50% of the unpaid half (§5). Rounding down means an
 * odd kobo is extinguished rather than owed -- the company never accrues a
 * liability it did not agree to, and the direction is stated rather than left
 * to whatever Math.round happened to do.
 */
export const half = (k: Kobo): Kobo => Math.floor(k / 2);
