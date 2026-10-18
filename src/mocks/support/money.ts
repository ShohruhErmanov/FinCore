import type { MoneyUzs } from '@/shared/types/domain';
import { periodRows } from '../state';

export function percentageValue(actual: MoneyUzs, denominator: MoneyUzs): number | null {
  const divisor = BigInt(denominator);
  if (divisor === 0n) return null;
  const numerator = BigInt(actual) * 10_000n;
  const negative = numerator < 0n !== divisor < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDivisor = divisor < 0n ? -divisor : divisor;
  const rounded = (absoluteNumerator + absoluteDivisor / 2n) / absoluteDivisor;
  return Number(negative ? -rounded : rounded) / 100;
}

export function isPositiveMoney(value: unknown): value is MoneyUzs {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

export function isNonNegativeMoney(value: unknown): value is MoneyUzs {
  return typeof value === 'string' && /^\d+$/.test(value);
}

export function findPeriodForBusinessDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== Number(match[3])
  )
    return null;
  return periodRows.find((period) => period.year === year && period.month === month) ?? null;
}

export function sumMoney(values: MoneyUzs[]): MoneyUzs {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
}

export function planActual(
  plannedAmountUzs: MoneyUzs | null,
  actualAmountUzs: MoneyUzs,
  hasPlan = plannedAmountUzs !== null,
) {
  const planned = plannedAmountUzs === null ? null : BigInt(plannedAmountUzs);
  const actual = BigInt(actualAmountUzs);
  const varianceUzs = planned === null ? null : (planned - actual).toString();
  const completionPercent =
    planned === null ? null : percentageValue(actualAmountUzs, plannedAmountUzs ?? '0');
  const status = !hasPlan
    ? actual > 0n
      ? 'unplanned'
      : 'no_plan'
    : planned === actual
      ? 'on_plan'
      : planned !== null && actual > planned
        ? 'over_plan'
        : 'under_plan';
  return { hasPlan, plannedAmountUzs, actualAmountUzs, varianceUzs, completionPercent, status };
}

export const monthShortNames = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyun',
  'Iyul',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Oylik summani kunlarga qoldiqsiz bo‘ladi: bo‘laklar yig‘indisi aynan oylik summaga teng. */
export function distributeDaily(monthly: bigint, days: number): bigint[] {
  const total = BigInt(days);
  return Array.from(
    { length: days },
    (_, index) => (monthly * BigInt(index + 1)) / total - (monthly * BigInt(index)) / total,
  );
}
