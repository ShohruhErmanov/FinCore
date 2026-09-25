import { describe, expect, it } from 'vitest';
import { buildAnnualRevenue, netMarginPct, type MonthlyRevenueRow } from './annual-revenue';

const million = (n: number) => BigInt(n) * 1_000_000n;
const map = (entries: Record<number, [bigint, bigint]>) =>
  new Map<number, MonthlyRevenueRow>(
    Object.entries(entries).map(([month, [actual, planned]]) => [
      Number(month),
      { actual, planned },
    ]),
  );

describe('buildAnnualRevenue', () => {
  it('totals the year and measures it against the plan', () => {
    const result = buildAnnualRevenue(
      2026,
      map({ 1: [million(30), million(40)], 2: [million(50), million(50)] }),
      0n,
    );

    expect(result.totalActualUzs).toBe('80000000');
    expect(result.totalPlanUzs).toBe('90000000');
    expect(result.completionPct).toBe(88.89);
  });

  it('always returns twelve months, empty ones at zero', () => {
    const result = buildAnnualRevenue(2026, map({ 8: [million(10), 0n] }), 0n);
    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toMatchObject({ actualUzs: '0', planUzs: '0' });
  });

  it('averages over months that earned, not over twelve', () => {
    // Excel does the same: an empty month is not a month of zero income.
    const result = buildAnnualRevenue(
      2026,
      map({ 1: [million(30), 0n], 2: [million(50), 0n] }),
      0n,
    );
    expect(result.averageMonthlyUzs).toBe('40000000');
    expect(result.averageMonthsCount).toBe(2);
  });

  it('reports no average for a year with no revenue', () => {
    const result = buildAnnualRevenue(2026, map({}), 0n);
    expect(result).toMatchObject({
      totalActualUzs: '0',
      averageMonthlyUzs: '0',
      averageMonthsCount: 0,
      peakMonth: null,
      completionPct: null,
    });
  });

  it('names the biggest month', () => {
    const result = buildAnnualRevenue(
      2026,
      map({ 3: [million(10), 0n], 8: [million(38), 0n], 9: [million(20), 0n] }),
      0n,
    );
    expect(result.peakMonth).toMatchObject({ month: 8, actualUzs: '38000000' });
  });

  it('compares the year against the one before it', () => {
    const result = buildAnnualRevenue(2026, map({ 1: [million(118), 0n] }), million(100));
    expect(result).toMatchObject({
      growthPct: 18,
      previousYear: 2025,
      previousYearUzs: '100000000',
    });
  });

  it('reports a fall as a negative growth', () => {
    const result = buildAnnualRevenue(2026, map({ 1: [million(80), 0n] }), million(100));
    expect(result.growthPct).toBe(-20);
  });

  it('gives no growth figure when last year recorded nothing', () => {
    // Dividing by zero would be an infinite rise, which says nothing.
    const result = buildAnnualRevenue(2026, map({ 1: [million(80), 0n] }), 0n);
    expect(result.growthPct).toBeNull();
    expect(result.previousYearUzs).toBe('0');
  });

  it('keeps completion per month as well as for the year', () => {
    const result = buildAnnualRevenue(2026, map({ 5: [million(45), million(50)] }), 0n);
    expect(result.months[4]?.completionPct).toBe(90);
  });

  it('stays exact beyond what a JS number holds', () => {
    const huge = 9_007_199_254_740_993n;
    const result = buildAnnualRevenue(2026, map({ 1: [huge, huge] }), 0n);
    expect(result.totalActualUzs).toBe('9007199254740993');
    expect(result.completionPct).toBe(100);
  });
});

describe('netMarginPct', () => {
  it('is the share of revenue that survived as profit', () => {
    expect(netMarginPct(288_635_471n, 295_741_471n)).toBe(97.6);
  });

  it('is negative when the year lost money', () => {
    expect(netMarginPct(-50n, 100n)).toBe(-50);
  });

  it('is absent rather than infinite when there was no revenue', () => {
    expect(netMarginPct(-7_106_000n, 0n)).toBeNull();
  });

  it('is a hundred percent when nothing was spent', () => {
    expect(netMarginPct(100n, 100n)).toBe(100);
  });
});
