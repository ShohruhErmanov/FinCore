import { describe, expect, it } from 'vitest';
import { buildRevenueGrowth, daysInMonth, monthlyGrowthSpans } from './revenue-growth';

const million = (n: number) => BigInt(n) * 1_000_000n;

describe('daysInMonth', () => {
  it('knows the short months', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 8)).toBe(31);
  });

  it('knows a leap February', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe('monthlyGrowthSpans', () => {
  it('compares whole months once the month is over', () => {
    const spans = monthlyGrowthSpans(2026, 8);

    expect(spans.throughDay).toBeNull();
    expect(spans.current).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(spans.previous).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('compares a running selected month against the complete previous month', () => {
    const spans = monthlyGrowthSpans(2026, 9);

    expect(spans.throughDay).toBeNull();
    expect(spans.current).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(spans.previous).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('uses each calendar month’s real final day', () => {
    const spans = monthlyGrowthSpans(2026, 3);
    expect(spans.current).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(spans.previous).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('steps back across the new year', () => {
    const spans = monthlyGrowthSpans(2026, 1);

    expect(spans.previousMonth).toBe(12);
    expect(spans.previousYear).toBe(2025);
    expect(spans.previous).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('treats a future month as a whole month, since nothing is running yet', () => {
    const spans = monthlyGrowthSpans(2026, 12);
    expect(spans.throughDay).toBeNull();
    expect(spans.current.to).toBe('2026-12-31');
  });
});

describe('buildRevenueGrowth', () => {
  const spans = monthlyGrowthSpans(2026, 9);

  it('keeps monthly and annual growth as two separate figures', () => {
    const result = buildRevenueGrowth(
      spans,
      { current: million(112), previous: million(100) },
      { year: 2026, current: million(1187), previous: million(1000) },
    );

    expect(result.monthly.changePct).toBe(12);
    expect(result.annual.changePct).toBe(18.7);
    // The two never collapse into one number.
    expect(result.monthly.changePct).not.toBe(result.annual.changePct);
  });

  it('identifies the two calendar months being compared', () => {
    const result = buildRevenueGrowth(
      spans,
      { current: million(112), previous: million(100) },
      { year: 2026, current: 0n, previous: 0n },
    );

    expect(result.monthly).toMatchObject({
      monthLabel: 'Sen',
      previousMonthLabel: 'Avg',
      throughDay: null,
    });
  });

  it('marks a finished month as a whole-month comparison', () => {
    const whole = monthlyGrowthSpans(2026, 8);
    const result = buildRevenueGrowth(
      whole,
      { current: million(300), previous: million(250) },
      { year: 2026, current: 0n, previous: 0n },
    );

    expect(result.monthly.throughDay).toBeNull();
    expect(result.monthly.changePct).toBe(20);
  });

  it('never estimates when the previous month earned nothing', () => {
    const result = buildRevenueGrowth(
      spans,
      { current: million(11), previous: 0n },
      { year: 2026, current: 0n, previous: 0n },
    );

    expect(result.monthly.changePct).toBeNull();
    expect(result.monthly.previousUzs).toBe('0');
  });

  it('never estimates when the previous year recorded nothing', () => {
    const result = buildRevenueGrowth(
      spans,
      { current: 0n, previous: 0n },
      { year: 2026, current: million(313), previous: 0n },
    );

    expect(result.annual).toMatchObject({
      changePct: null,
      previousYear: 2025,
      previousUzs: '0',
    });
  });

  it('reports a fall as a negative figure', () => {
    const result = buildRevenueGrowth(
      spans,
      { current: million(40), previous: million(100) },
      { year: 2026, current: million(80), previous: million(100) },
    );

    expect(result.monthly.changePct).toBe(-60);
    expect(result.annual.changePct).toBe(-20);
  });

  it('carries both raw amounts so the card can show what it compared', () => {
    const result = buildRevenueGrowth(
      spans,
      { current: 11_000_000n, previous: 302_841_471n },
      { year: 2026, current: 313_841_471n, previous: 0n },
    );

    expect(result.monthly.currentUzs).toBe('11000000');
    expect(result.monthly.previousUzs).toBe('302841471');
    expect(result.annual.currentUzs).toBe('313841471');
  });

  it('calculates September against the complete August revenue', () => {
    const result = buildRevenueGrowth(
      spans,
      { current: 11_000_000n, previous: 302_841_471n },
      { year: 2026, current: 313_841_471n, previous: 0n },
    );

    expect(result.monthly).toMatchObject({
      currentUzs: '11000000',
      previousUzs: '302841471',
      changePct: -96.37,
      throughDay: null,
    });
  });
});
