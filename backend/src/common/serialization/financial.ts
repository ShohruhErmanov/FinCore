import { Prisma } from '@prisma/client';

/**
 * Response serialization rules enforced by the frontend client
 * (assertFinancialPayload in src/shared/api/client.ts). Every violation there
 * throws before a component renders, so the backend must be the one that gets
 * this right.
 *
 *   *Uzs            -> integer string, e.g. "1732500" (never a JS number)
 *   *At             -> RFC3339 with offset, e.g. "2026-08-20T09:15:00.000Z"
 *   transactionDate -> ISO calendar date, e.g. "2026-08-20"
 *   *percent|*Pct   -> finite JS number
 */

/** Money is stored as NUMERIC/BIGINT tiyin-free UZS and travels as a digit string. */
export function toMoneyUzs(value: bigint | number | string | Prisma.Decimal | null): string | null {
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Prisma.Decimal) return value.toFixed(0);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError(`MoneyUzs must be integral, got ${value}`);
    return value.toString();
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) throw new TypeError(`MoneyUzs must be an integer string, got "${value}"`);
  return trimmed;
}

export function toIsoDateTime(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/** UTC calendar date — the business date is stored as DATE and must not shift. */
export function toIsoDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError(`IsoDate expected, got "${value}"`);
    return value;
  }
  return value.toISOString().slice(0, 10);
}

/** Percentages cross the wire as numbers, rounded server-side so clients agree. */
export function toPercent(numerator: bigint | number, denominator: bigint | number, digits = 2): number {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) return 0;
  const factor = 10 ** digits;
  return Math.round((top / bottom) * 100 * factor) / factor;
}
