import { describe, expect, it } from 'vitest';
import { buildRevenuePlanYear, type PlanYearRow } from './revenue-plan-year';

const SAYXUN = '10000000-0000-0000-0000-000000000001';
const XALQLAR = '10000000-0000-0000-0000-000000000002';
const period = (month: number) =>
  `20000000-0000-0000-0000-0000000000${String(month).padStart(2, '0')}`;

function row(
  month: number,
  branchId: string,
  plannedUzs: bigint | null,
  actualUzs: bigint,
): PlanYearRow {
  return {
    month,
    periodId: period(month),
    branchId,
    branchName: branchId === SAYXUN ? 'Sayxun' : "Xalqlar do'stligi",
    plannedUzs,
    actualUzs,
  };
}

describe('buildRevenuePlanYear', () => {
  it('always returns twelve months, empty where no period exists', () => {
    const result = buildRevenuePlanYear(2026, [row(8, SAYXUN, 100n, 90n)]);

    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toMatchObject({
      month: 1,
      label: 'Yan',
      periodId: null,
      plannedAmountUzs: null,
      actualAmountUzs: '0',
      completionPercent: null,
    });
    expect(result.months[7]!.periodId).toBe(period(8));
  });

  it('adds the branches plans together for the month', () => {
    // The real August 2026 board.
    const result = buildRevenuePlanYear(2026, [
      row(8, SAYXUN, 155_252_779n, 158_875_085n),
      row(8, XALQLAR, 152_900_153n, 143_966_386n),
    ]);
    const august = result.months[7]!;

    expect(august.plannedAmountUzs).toBe('308152932');
    expect(august.actualAmountUzs).toBe('302841471');
    expect(august.completionPercent).toBe(98.28);
    expect(august.branches.map((cell) => cell.completionPercent)).toEqual([102.33, 94.16]);
  });

  it('measures completion only against branches that have a plan', () => {
    // Xalqlar had no plan in March: its revenue is real and counted, but it
    // must not make Sayxun's plan look beaten.
    const result = buildRevenuePlanYear(2026, [
      row(3, SAYXUN, 100n, 50n),
      row(3, XALQLAR, null, 500n),
    ]);
    const march = result.months[2]!;

    expect(march.actualAmountUzs).toBe('550');
    expect(march.actualAgainstPlanUzs).toBe('50');
    expect(march.completionPercent).toBe(50);
    expect(march.branches[1]).toMatchObject({ plannedAmountUzs: null, completionPercent: null });
  });

  it('keeps a month with no plan apart from a plan of zero', () => {
    const result = buildRevenuePlanYear(2026, [row(4, SAYXUN, null, 10n), row(5, SAYXUN, 0n, 10n)]);

    expect(result.months[3]!.plannedAmountUzs).toBeNull();
    expect(result.months[4]!.plannedAmountUzs).toBe('0');
    // Zero is a plan, so the month counts as planned, but has no percentage.
    expect(result.months[4]!.completionPercent).toBeNull();
    expect(result.plannedMonths).toBe(1);
  });

  it('totals the year and every branch over the months they planned', () => {
    const result = buildRevenuePlanYear(2026, [
      row(8, SAYXUN, 200n, 150n),
      row(8, XALQLAR, 100n, 100n),
      row(9, SAYXUN, 100n, 100n),
      row(9, XALQLAR, null, 40n),
      row(10, SAYXUN, null, 7n),
      row(10, XALQLAR, null, 3n),
    ]);

    expect(result).toMatchObject({
      year: 2026,
      plannedAmountUzs: '400',
      actualAmountUzs: '400',
      actualAgainstPlanUzs: '350',
      completionPercent: 87.5,
      plannedMonths: 2,
    });
    expect(result.branches).toEqual([
      {
        branchId: SAYXUN,
        branchName: 'Sayxun',
        plannedAmountUzs: '300',
        actualAmountUzs: '257',
        actualAgainstPlanUzs: '250',
        completionPercent: 83.33,
        plannedMonths: 2,
      },
      {
        branchId: XALQLAR,
        branchName: "Xalqlar do'stligi",
        plannedAmountUzs: '100',
        actualAmountUzs: '143',
        actualAgainstPlanUzs: '100',
        completionPercent: 100,
        plannedMonths: 1,
      },
    ]);
  });

  it('reports no completion for a year with no plan at all', () => {
    const result = buildRevenuePlanYear(2026, [row(1, SAYXUN, null, 5n)]);
    expect(result.completionPercent).toBeNull();
    expect(result.branches[0]!.completionPercent).toBeNull();
    expect(result.plannedMonths).toBe(0);
  });

  it('stays exact past the float range', () => {
    const huge = 9_007_199_254_740_993n; // 2^53 + 1
    const result = buildRevenuePlanYear(2026, [
      row(1, SAYXUN, huge, 1n),
      row(1, XALQLAR, huge, 1n),
    ]);
    expect(result.plannedAmountUzs).toBe('18014398509481986');
  });
});
