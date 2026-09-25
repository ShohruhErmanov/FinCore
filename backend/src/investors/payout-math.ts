/**
 * The investor's share of actual revenue, and how much of it may still be paid.
 *
 * Two money shapes meet here, and keeping them apart is the whole point:
 *
 *   * the SHARE is exact to two decimals — 302 841 471 x 2% is 6 056 829.42,
 *     and rounding that to whole so'm on every period would quietly lose the
 *     remainder and make a year disagree with the sum of its months;
 *   * a PAYMENT is whole so'm, because fincore.investor_payments is BIGINT and
 *     an amount that cannot be handed over cannot be paid.
 *
 * Nothing here uses a JS number for money. Decimal amounts are carried as
 * bigint HUNDREDTHS of a so'm, so every operation is exact and matches what
 * PostgreSQL NUMERIC(20,2) computes for the same inputs.
 */

/** A two-decimal so'm amount, held as hundredths. 6 056 829.42 -> 605682942n. */
export type Hundredths = bigint;

const HUNDRED = 100n;

/**
 * Parses what PostgreSQL returns for a NUMERIC(20,2) column, and also the
 * looser shapes a client might send ("6056829", "6056829.4", "6056829.42").
 */
export function parseDecimalUzs(value: string): Hundredths {
  const text = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text))
    throw new Error(`NUMERIC summa kutilgan, olindi: ${value}`);

  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.');
  // Two decimals is the stored precision; anything beyond it is truncated
  // rather than rounded, because a third decimal of a so'm is not money.
  const cents = `${fraction}00`.slice(0, 2);
  const magnitude = BigInt(whole) * HUNDRED + BigInt(cents);
  return negative ? -magnitude : magnitude;
}

/** Formats for transport. Always two decimals, so the UI never has to guess. */
export function formatDecimalUzs(value: Hundredths): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / HUNDRED;
  const cents = magnitude % HUNDRED;
  return `${negative ? '-' : ''}${whole}.${String(cents).padStart(2, '0')}`;
}

/** Whole so'm -> hundredths. Used where a BIGINT column meets a NUMERIC one. */
export function fromWholeUzs(value: bigint): Hundredths {
  return value * HUNDRED;
}

/**
 * Divides with half-up rounding, matching PostgreSQL's round() on NUMERIC.
 * Written with bigint remainders rather than division, so it stays exact at any
 * magnitude — a float would already be wrong at a few hundred million so'm.
 */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * actual revenue x ownership_percent, to two decimals.
 *
 * This deliberately reproduces what fincore.v_investor_period_share computes in
 * SQL. The API never recomputes the number it serves — it reads the view — but
 * an independent implementation is what lets a test assert the two agree, so a
 * change to either one cannot silently drift.
 */
export function shareOf(factRevenueUzs: bigint, ownershipPercent: string): Hundredths {
  // percent -> hundredths of a percent, so 2.00 becomes 200 with no rounding.
  const percentHundredths = parseDecimalUzs(ownershipPercent);
  // share_som      = fact * percent / 100
  // share_hundredths = share_som * 100 = fact * percent
  //                  = fact * percentHundredths / 100
  return divideRoundHalfUp(factRevenueUzs * percentHundredths, HUNDRED);
}

/**
 * The canonical annual share.
 *
 * Deliberately NOT the sum of the twelve monthly shares. Each month is rounded
 * to two decimals on its own, so adding twelve rounded figures can drift from
 * the true yearly share by a few tiyin. The rule, stated once and applied
 * everywhere:
 *
 *   1. sum the underlying fact revenue for the year (exact, integer so'm);
 *   2. apply the ownership percentage ONCE;
 *   3. round ONCE, to two decimals.
 *
 * A UI that adds up the monthly column may therefore show a figure up to a few
 * tiyin away from this one. That is expected and is the monthly column being
 * imprecise, not this.
 */
export function annualShare(monthlyFactRevenue: bigint[], ownershipPercent: string): Hundredths {
  const annualFact = monthlyFactRevenue.reduce((total, value) => total + value, 0n);
  return shareOf(annualFact, ownershipPercent);
}

export interface PayoutAvailability {
  /** The period's exact share. */
  shareUzs: string;
  /** Already settled by posted payments. */
  paidUzs: string;
  /** Asked for but not yet paid — pending plus approved. */
  openUzs: string;
  /** share - paid - open. Can hold a sub-so'm remainder, and that is correct. */
  remainingUzs: string;
  /**
   * The largest whole-so'm amount a new request may ask for. Floored, never
   * rounded: asking for more than is left is exactly what the guards reject.
   */
  payableUzs: string;
  /**
   * The part of `remaining` below one so'm — what is owed but can never be
   * handed over. Always 0.00..0.99, and zero once nothing is left.
   */
  residualUzs: string;
  /** Nothing further can be paid — under one so'm is left. */
  isSettled: boolean;
}

/**
 * What an investor may still request for one period.
 *
 * `remaining` keeps the decimals; `payable` is what can actually be paid. When
 * a share ends in .42, the last 42 tiyin are never paid and never written off —
 * they stay visible in `remaining`, and `isSettled` becomes true because no
 * payable so'm is left.
 */
export function availability(
  share: Hundredths,
  paid: Hundredths,
  open: Hundredths,
): PayoutAvailability {
  const remaining = share - paid - open;
  // A negative remainder means more was paid than the share now justifies —
  // revenue can be reversed after a payment. It is surfaced, not clamped away,
  // but nothing further is payable.
  const payableWhole = remaining <= 0n ? 0n : remaining / HUNDRED;

  return {
    shareUzs: formatDecimalUzs(share),
    paidUzs: formatDecimalUzs(paid),
    openUzs: formatDecimalUzs(open),
    remainingUzs: formatDecimalUzs(remaining),
    payableUzs: String(payableWhole),
    // What is left once every payable so'm is taken out. Negative remainders
    // are an overpayment, not a residual, so they report zero here.
    residualUzs: formatDecimalUzs(remaining <= 0n ? 0n : remaining - payableWhole * HUNDRED),
    isSettled: payableWhole === 0n,
  };
}

/** Sums periods without ever leaving exact arithmetic. */
export function totalHundredths(values: Hundredths[]): Hundredths {
  return values.reduce((sum, value) => sum + value, 0n);
}
