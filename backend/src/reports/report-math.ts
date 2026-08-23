import { toMoneyUzs } from '@/common/serialization/financial';

/**
 * Arithmetic shared by every report DTO. These mirror the mock backend's
 * helpers exactly (src/mocks/handlers.ts:205-228) so a screen shows the same
 * number whether it is fed by MSW or by PostgreSQL.
 */

export type PlanActualStatus = 'no_plan' | 'unplanned' | 'under_plan' | 'on_plan' | 'over_plan';

export interface PlanActual {
  hasPlan: boolean;
  plannedAmountUzs: string | null;
  actualAmountUzs: string;
  varianceUzs: string | null;
  completionPercent: number | null;
  status: PlanActualStatus;
}

/**
 * Two decimals, computed in bigint so a large UZS amount never loses precision
 * on the way through a float. A zero denominator yields null, not zero or
 * Infinity — "no plan" is not "0% complete".
 */
export function percentageValue(actual: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  const numerator = actual * 10_000n;
  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const rounded = (absNumerator + absDenominator / 2n) / absDenominator;
  return Number(negative ? -rounded : rounded) / 100;
}

export function planActual(
  planned: bigint | null,
  actual: bigint,
  hasPlan = planned !== null,
): PlanActual {
  const status: PlanActualStatus = !hasPlan
    ? actual > 0n
      ? 'unplanned'
      : 'no_plan'
    : planned === actual
      ? 'on_plan'
      : planned !== null && actual > planned
        ? 'over_plan'
        : 'under_plan';

  return {
    hasPlan,
    plannedAmountUzs: planned === null ? null : toMoneyUzs(planned),
    actualAmountUzs: toMoneyUzs(actual)!,
    varianceUzs: planned === null ? null : toMoneyUzs(planned - actual),
    completionPercent: planned === null ? null : percentageValue(actual, planned),
    status,
  };
}

/** Views return int8/numeric; both arrive as bigint or Decimal-like objects. */
export function toBigInt(value: unknown): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return BigInt(String(value).split('.')[0] || '0');
}

export const MONTHS_SHORT_UZ = [
  'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn',
  'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek',
];

export const MONTHS_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

/**
 * Splits a monthly figure across days without losing or inventing a tiyin:
 * every daily share is the difference of two running proportions.
 */
export function distributeDaily(monthly: bigint, days: number): bigint[] {
  const total = BigInt(days);
  return Array.from(
    { length: days },
    (_, index) => (monthly * BigInt(index + 1)) / total - (monthly * BigInt(index)) / total,
  );
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
