import { describe, expect, it } from 'vitest';
import { buildDayTrends, buildMonthTrends } from './dashboard-trends';

const august = {
  year: 2026,
  month: 8,
  expensePlanned: 3_100n,
  revenuePlanned: 6_200n,
  expenseByDay: new Map([
    ['2026-08-01', 50n],
    ['2026-08-31', 70n],
  ]),
  revenueByDay: new Map([['2026-08-15', 900n]]),
};

const total = (points: Array<{ planUzs: string }>) =>
  points.reduce((sum, point) => sum + BigInt(point.planUzs), 0n);

describe('buildDayTrends', () => {
  it('gives one point per day, actuals on their date and the plan spread evenly', () => {
    const { expense, revenue } = buildDayTrends('daily', august);
    expect(expense).toHaveLength(31);
    expect(expense[0]).toEqual({
      bucket: '2026-08-01',
      label: '1',
      planUzs: '100',
      actualUzs: '50',
    });
    expect(expense[30]?.actualUzs).toBe('70');
    expect(revenue[14]?.actualUzs).toBe('900');
    expect(total(expense)).toBe(3_100n);
    expect(total(revenue)).toBe(6_200n);
  });

  it('groups the month into weeks of seven days, the last one shorter', () => {
    const { expense } = buildDayTrends('weekly', august);
    expect(expense.map((point) => point.label)).toEqual(['1–7', '8–14', '15–21', '22–28', '29–31']);
    expect(expense.map((point) => point.bucket)).toEqual([
      '2026-08-W1',
      '2026-08-W2',
      '2026-08-W3',
      '2026-08-W4',
      '2026-08-W5',
    ]);
    expect(expense[0]?.actualUzs).toBe('50');
    expect(expense[4]?.actualUzs).toBe('70');
    expect(total(expense)).toBe(3_100n);
  });

  it('never loses a so‘m when the plan does not divide by the days', () => {
    const { revenue } = buildDayTrends('daily', { ...august, month: 2, revenuePlanned: 1_000n });
    expect(revenue).toHaveLength(28);
    expect(total(revenue)).toBe(1_000n);
  });
});

describe('buildMonthTrends', () => {
  it('returns twelve points, months without rows reading zero', () => {
    const { expense, revenue } = buildMonthTrends(
      2026,
      [{ month: 3, planned: 500n, actual: '420' }],
      [],
    );
    expect(expense).toHaveLength(12);
    expect(expense[2]).toEqual({
      bucket: '2026-03',
      label: 'Mar',
      planUzs: '500',
      actualUzs: '420',
    });
    expect(expense[0]).toEqual({ bucket: '2026-01', label: 'Yan', planUzs: '0', actualUzs: '0' });
    expect(revenue.every((point) => point.planUzs === '0' && point.actualUzs === '0')).toBe(true);
  });
});
