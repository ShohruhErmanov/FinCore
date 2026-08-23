import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { toIsoDate, toIsoDateTime, toMoneyUzs, toPercent } from './financial';

describe('toMoneyUzs', () => {
  it('renders bigint without precision loss', () => {
    // Beyond Number.MAX_SAFE_INTEGER — the whole reason money is not a JS number.
    expect(toMoneyUzs(9_007_199_254_740_993n)).toBe('9007199254740993');
  });

  it('drops the fractional part of a Decimal, since UZS has no subunit', () => {
    expect(toMoneyUzs(new Prisma.Decimal('1732500'))).toBe('1732500');
    expect(toMoneyUzs(new Prisma.Decimal('1732500.00'))).toBe('1732500');
  });

  it('accepts an integral number', () => {
    expect(toMoneyUzs(1732500)).toBe('1732500');
    expect(toMoneyUzs(-5000)).toBe('-5000');
    expect(toMoneyUzs(0)).toBe('0');
  });

  it('refuses a fractional number instead of silently rounding', () => {
    expect(() => toMoneyUzs(1732500.5)).toThrow(/integral/);
  });

  it('passes through an already-valid string and trims it', () => {
    expect(toMoneyUzs('1732500')).toBe('1732500');
    expect(toMoneyUzs('  -42  ')).toBe('-42');
  });

  it('refuses a string that is not an integer', () => {
    for (const bad of ['1 732 500', '1732500.00', '1,732,500', '', 'abc'])
      expect(() => toMoneyUzs(bad)).toThrow(/integer string/);
  });

  it('preserves null', () => {
    expect(toMoneyUzs(null)).toBeNull();
  });
});

describe('toIsoDateTime', () => {
  it('emits an RFC3339 timestamp the frontend accepts', () => {
    const value = toIsoDateTime(new Date(Date.UTC(2026, 7, 20, 9, 15)));
    expect(value).toBe('2026-08-20T09:15:00.000Z');
    expect(value).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
  });

  it('preserves null', () => {
    expect(toIsoDateTime(null)).toBeNull();
  });
});

describe('toIsoDate', () => {
  it('takes the UTC calendar date so the business date cannot shift', () => {
    expect(toIsoDate(new Date('2026-08-20T23:30:00Z'))).toBe('2026-08-20');
    expect(toIsoDate(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('passes through an already-formatted date', () => {
    expect(toIsoDate('2026-08-20')).toBe('2026-08-20');
  });

  it('refuses a malformed date string', () => {
    expect(() => toIsoDate('20.08.2026')).toThrow(/IsoDate/);
  });

  it('preserves null', () => {
    expect(toIsoDate(null)).toBeNull();
  });
});

describe('toPercent', () => {
  it('rounds to two decimals by default', () => {
    expect(toPercent(15, 16)).toBe(93.75);
    expect(toPercent(1, 3)).toBe(33.33);
  });

  it('returns 0 rather than Infinity or NaN when there is no denominator', () => {
    expect(toPercent(100, 0)).toBe(0);
    expect(toPercent(0, 0)).toBe(0);
  });

  it('handles bigint inputs', () => {
    expect(toPercent(1_732_500n, 2_000_000n)).toBe(86.63);
  });

  it('honours an explicit precision', () => {
    expect(toPercent(1, 3, 0)).toBe(33);
    expect(toPercent(1, 3, 4)).toBe(33.3333);
  });

  it('always produces a finite number, as the contract requires', () => {
    for (const value of [toPercent(1, 0), toPercent(-5, 10), toPercent(3, 7)])
      expect(Number.isFinite(value)).toBe(true);
  });
});
