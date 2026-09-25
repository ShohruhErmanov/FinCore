import { toMoneyUzs } from '@/common/serialization/financial';
import { percentageValue } from '@/reports/report-math';

/**
 * Settlement arithmetic for one investor over one span of time.
 *
 * Two numbers are deliberately kept apart everywhere in this module:
 *
 *   ownershipPercent — the investor's share of the company (e.g. 2%);
 *   paidPercent      — how much of what is owed has been handed over (e.g. 80%).
 *
 * They are never added, compared or rendered in the same field.
 */

export type SettlementStatus = 'no_entitlement' | 'unpaid' | 'partially_paid' | 'settled' | 'overpaid';

export interface Settlement {
  entitledAmountUzs: string;
  paidAmountUzs: string;
  /** Never negative: an overpayment is reported separately, not as debt below zero. */
  remainingAmountUzs: string;
  /** Zero unless paid exceeds entitled. Surfaced so an overpayment cannot hide. */
  overpaidAmountUzs: string;
  /** paid / entitled. Exceeds 100 when overpaid — the raw truth. */
  paidPercent: number;
  /** remaining / entitled. */
  remainingPercent: number;
  /** paidPercent capped at 100, for progress bars that cannot render past full. */
  settledPercent: number;
  status: SettlementStatus;
}

/** percentageValue returns null on a zero denominator; a missing ratio is 0 here, never NaN. */
function ratio(numerator: bigint, denominator: bigint): number {
  return denominator === 0n ? 0 : (percentageValue(numerator, denominator) ?? 0);
}

export function settle(entitled: bigint, paid: bigint): Settlement {
  const remaining = entitled > paid ? entitled - paid : 0n;
  const overpaid = paid > entitled ? paid - entitled : 0n;

  const paidPercent = ratio(paid, entitled);
  const remainingPercent = ratio(remaining, entitled);

  const status: SettlementStatus =
    entitled === 0n
      ? // Money paid against nothing owed is still an overpayment, not "settled".
        paid > 0n
        ? 'overpaid'
        : 'no_entitlement'
      : overpaid > 0n
        ? 'overpaid'
        : paid === 0n
          ? 'unpaid'
          : remaining === 0n
            ? 'settled'
            : 'partially_paid';

  return {
    entitledAmountUzs: toMoneyUzs(entitled)!,
    paidAmountUzs: toMoneyUzs(paid)!,
    remainingAmountUzs: toMoneyUzs(remaining)!,
    overpaidAmountUzs: toMoneyUzs(overpaid)!,
    paidPercent,
    remainingPercent,
    settledPercent: Math.min(paidPercent, 100),
    status,
  };
}

/**
 * A yearly figure is the sum of its months, never a separately stored total —
 * so the year can never drift away from the rows it is made of.
 */
export function settleTotal(months: Array<{ entitled: bigint; paid: bigint }>): Settlement {
  let entitled = 0n;
  let paid = 0n;
  for (const month of months) {
    entitled += month.entitled;
    paid += month.paid;
  }
  return settle(entitled, paid);
}

/** Percent is stored as NUMERIC(5,2); Prisma hands it back as a Decimal-like object. */
export function toOwnershipPercent(value: unknown): number {
  const parsed = Number(
    typeof value === 'object' && value !== null && 'toString' in value ? value.toString() : value,
  );
  return Number.isFinite(parsed) ? parsed : 0;
}
