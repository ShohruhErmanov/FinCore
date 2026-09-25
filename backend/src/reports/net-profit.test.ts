import { describe, expect, it } from 'vitest';
import { buildAnnualNetProfit, buildNetProfitPaymentMethodBreakdown } from './net-profit';

const million = (n: number) => BigInt(n) * 1_000_000n;
const map = (entries: Record<number, bigint>) =>
  new Map(Object.entries(entries).map(([month, value]) => [Number(month), value]));

describe('buildAnnualNetProfit', () => {
  it('is revenue minus expense, month by month', () => {
    const result = buildAnnualNetProfit(
      2026,
      map({ 1: million(30), 2: million(40) }),
      map({ 1: million(20), 2: million(45) }),
    );

    expect(result.months[0]).toMatchObject({
      month: 1,
      revenueUzs: '30000000',
      expenseUzs: '20000000',
      netProfitUzs: '10000000',
    });
    // February spent more than it collected — the month is a loss, not a zero.
    expect(result.months[1]?.netProfitUzs).toBe('-5000000');
  });

  it('always returns twelve months, empty ones included', () => {
    const result = buildAnnualNetProfit(2026, map({ 8: million(10) }), map({}));

    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toMatchObject({ netProfitUzs: '0', hasData: false });
    expect(result.months[7]).toMatchObject({ netProfitUzs: '10000000', hasData: true });
    expect(result.monthsWithData).toBe(1);
  });

  it('counts a month with only expenses as having data', () => {
    const result = buildAnnualNetProfit(2026, map({}), map({ 3: million(5) }));
    expect(result.months[2]).toMatchObject({ netProfitUzs: '-5000000', hasData: true });
  });

  it('sums the year from its months', () => {
    const result = buildAnnualNetProfit(
      2026,
      map({ 1: million(30), 2: million(40) }),
      map({ 1: million(20), 2: million(45) }),
    );
    expect(result.totalNetProfitUzs).toBe('5000000');
  });

  it('is zero for a year with nothing recorded', () => {
    const result = buildAnnualNetProfit(2026, map({}), map({}));
    expect(result).toMatchObject({
      totalNetProfitUzs: '0',
      bestMonth: null,
      worstMonth: null,
      monthsWithData: 0,
    });
  });

  it('picks the best and worst from months that carry data', () => {
    // January is empty; it must not win "worst" by being an implicit zero.
    const result = buildAnnualNetProfit(
      2026,
      map({ 5: million(10), 6: million(50), 7: million(20) }),
      map({ 5: million(30), 6: million(10), 7: million(5) }),
    );

    expect(result.bestMonth).toMatchObject({ month: 6, netProfitUzs: '40000000' });
    expect(result.worstMonth).toMatchObject({ month: 5, netProfitUzs: '-20000000' });
  });

  it('leaves the first month with data without a comparison', () => {
    const result = buildAnnualNetProfit(2026, map({ 4: million(10) }), map({}));
    expect(result.months[3]?.changePct).toBeNull();
  });

  it('compares only against the month directly before', () => {
    const result = buildAnnualNetProfit(2026, map({ 1: million(10), 2: million(15) }), map({}));
    expect(result.months[1]).toMatchObject({ changePct: 50, comparedToLabel: 'Yan' });
  });

  it('compares across a gap, and says which month it used', () => {
    // March is empty, so April is measured against February. Without the label
    // the reader would have no way to interpret the figure.
    const result = buildAnnualNetProfit(2026, map({ 2: million(10), 4: million(15) }), map({}));

    expect(result.months[2]?.changePct).toBeNull();
    expect(result.months[3]).toMatchObject({ changePct: 50, comparedToLabel: 'Fev' });
  });

  it('leaves the label out when there is nothing to compare against', () => {
    const result = buildAnnualNetProfit(2026, map({ 4: million(10) }), map({}));
    expect(result.months[3]).toMatchObject({ changePct: null, comparedToLabel: null });
  });

  it('reads a shrinking loss as an improvement', () => {
    // -10m then -5m is a 50% improvement, not a -50% fall: the comparison uses
    // the previous month's magnitude so the sign stays meaningful.
    const result = buildAnnualNetProfit(
      2026,
      map({ 1: 0n, 2: million(5) }),
      map({ 1: million(10), 2: million(10) }),
    );

    expect(result.months[0]?.netProfitUzs).toBe('-10000000');
    expect(result.months[1]?.netProfitUzs).toBe('-5000000');
    expect(result.months[1]?.changePct).toBe(50);
  });

  it('reports a drop as a negative change', () => {
    const result = buildAnnualNetProfit(
      2026,
      map({ 1: million(20), 2: million(10) }),
      map({ 1: 0n, 2: 0n }),
    );
    expect(result.months[1]?.changePct).toBe(-50);
  });

  it('gives no comparison when the previous month netted exactly zero', () => {
    const result = buildAnnualNetProfit(
      2026,
      map({ 1: million(10), 2: million(10) }),
      map({ 1: million(10) }),
    );

    expect(result.months[0]?.netProfitUzs).toBe('0');
    // Nothing to divide by, so the change is absent rather than infinite.
    expect(result.months[1]?.changePct).toBeNull();
  });

  it('stays exact on figures a JS number would round', () => {
    const huge = 9_007_199_254_740_993n;
    const result = buildAnnualNetProfit(2026, map({ 1: huge }), map({ 1: 1n }));
    expect(result.months[0]?.netProfitUzs).toBe('9007199254740992');
    expect(result.totalNetProfitUzs).toBe('9007199254740992');
  });

  it('labels every month', () => {
    const result = buildAnnualNetProfit(2026, map({}), map({}));
    expect(result.months.map((row) => row.label)).toHaveLength(12);
    expect(result.months.every((row) => row.label.length > 0)).toBe(true);
    expect(result.year).toBe(2026);
  });
});

describe('buildNetProfitPaymentMethodBreakdown', () => {
  const rows = (values: Array<[string, string, number, number, bigint, bigint]>) =>
    values.map(([id, code, sortOrder, month, revenue, expense]) => ({
      paymentMethodId: id,
      code,
      name: code,
      sortOrder,
      month,
      revenue,
      expense,
    }));

  it('uses revenue minus expense independently for every payment method', () => {
    const result = buildNetProfitPaymentMethodBreakdown(
      rows([
        ['cash', 'CASH', 1, 1, 30n, 10n],
        ['card', 'CARD', 2, 1, 20n, 5n],
        ['bank', 'BANK_TRANSFER', 3, 1, 15n, 10n],
      ]),
    );

    expect(result.paymentMethods).toMatchObject([
      { code: 'CASH', revenueUzs: '30', expenseUzs: '10', netProfitUzs: '20', sharePct: 50 },
      { code: 'CARD', revenueUzs: '20', expenseUzs: '5', netProfitUzs: '15', sharePct: 37.5 },
      {
        code: 'BANK_TRANSFER',
        revenueUzs: '15',
        expenseUzs: '10',
        netProfitUzs: '5',
        sharePct: 12.5,
      },
    ]);
    expect(result.paymentMethodMonths[0]?.totalNetProfitUzs).toBe('40');
  });

  it('always returns twelve months and keeps missing months at zero', () => {
    const result = buildNetProfitPaymentMethodBreakdown(rows([['cash', 'CASH', 1, 8, 100n, 40n]]));

    expect(result.paymentMethodMonths).toHaveLength(12);
    expect(result.paymentMethodMonths[0]?.paymentMethods[0]?.netProfitUzs).toBe('0');
    expect(result.paymentMethodMonths[7]?.paymentMethods[0]?.netProfitUzs).toBe('60');
  });

  it('returns zero percentages for a zero year', () => {
    const result = buildNetProfitPaymentMethodBreakdown(
      rows([
        ['cash', 'CASH', 1, 1, 10n, 10n],
        ['card', 'CARD', 2, 1, 0n, 0n],
      ]),
    );
    expect(result.paymentMethods.map((method) => method.sharePct)).toEqual([0, 0]);
  });

  it('does not clamp a method or annual loss to zero', () => {
    const result = buildNetProfitPaymentMethodBreakdown(
      rows([
        ['cash', 'CASH', 1, 1, 10n, 30n],
        ['card', 'CARD', 2, 1, 5n, 0n],
      ]),
    );
    expect(result.paymentMethods).toMatchObject([
      { code: 'CASH', netProfitUzs: '-20', sharePct: 133.33 },
      { code: 'CARD', netProfitUzs: '5', sharePct: -33.33 },
    ]);
    expect(result.paymentMethodMonths[0]?.totalNetProfitUzs).toBe('-15');
  });

  it('preserves every real method, including non-core historical methods', () => {
    const result = buildNetProfitPaymentMethodBreakdown(
      rows([
        ['cash', 'CASH', 1, 1, 1n, 0n],
        ['click', 'CLICK_PAYME', 4, 1, 2n, 0n],
        ['other', 'OTHER', 6, 1, 3n, 0n],
      ]),
    );
    expect(result.paymentMethods.map((method) => method.code)).toEqual([
      'CASH',
      'CLICK_PAYME',
      'OTHER',
    ]);
  });

  it('keeps values above Number.MAX_SAFE_INTEGER exact', () => {
    const huge = 9_007_199_254_740_993n;
    const result = buildNetProfitPaymentMethodBreakdown(
      rows([['bank', 'BANK_TRANSFER', 1, 12, huge, 1n]]),
    );
    expect(result.paymentMethods[0]?.netProfitUzs).toBe('9007199254740992');
    expect(result.paymentMethodMonths[11]?.totalNetProfitUzs).toBe('9007199254740992');
  });

  it('reconciles annual methods and monthly cells exactly', () => {
    const result = buildNetProfitPaymentMethodBreakdown(
      rows([
        ['cash', 'CASH', 1, 1, 50n, 10n],
        ['cash', 'CASH', 1, 2, 30n, 5n],
        ['bank', 'BANK_TRANSFER', 2, 2, 15n, 20n],
      ]),
    );
    const annual = result.paymentMethods.reduce(
      (total, method) => total + BigInt(method.netProfitUzs),
      0n,
    );
    const monthly = result.paymentMethodMonths.reduce(
      (total, month) => total + BigInt(month.totalNetProfitUzs),
      0n,
    );
    expect(monthly).toBe(annual);
    expect(annual).toBe(60n);
  });
});
