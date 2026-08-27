import { describe, expect, it } from 'vitest';
import {
  averageMonthlyPlan,
  buildMonthlyReportMatrix,
  percentOfTotal,
} from '@/features/reports/monthly-report';
import type {
  ExpenseType,
  MonthlyReport,
  MonthlyReportRow,
  PlanActual,
} from '@/shared/types/domain';

function plan(planned: string | null, actual: string): PlanActual {
  const variance = planned === null ? null : (BigInt(planned) - BigInt(actual)).toString();
  return {
    hasPlan: planned !== null,
    plannedAmountUzs: planned,
    actualAmountUzs: actual,
    varianceUzs: variance,
    completionPercent: null,
    status: planned === null ? (actual === '0' ? 'no_plan' : 'unplanned') : 'under_plan',
  };
}

function row(
  id: string,
  type: ExpenseType,
  monthlyValues: Array<{ planned: string | null; actual: string }>,
): MonthlyReportRow {
  const months = Array.from({ length: 12 }, (_, index) => {
    const value = monthlyValues[index] ?? { planned: null, actual: '0' };
    return { month: index + 1, planActual: plan(value.planned, value.actual), transactionCount: 0 };
  });
  const plannedValues = months.flatMap((month) =>
    month.planActual.plannedAmountUzs === null ? [] : [BigInt(month.planActual.plannedAmountUzs)],
  );
  const annualPlanned = plannedValues.length
    ? plannedValues.reduce((total, value) => total + value, 0n).toString()
    : null;
  const annualActual = months
    .reduce((total, month) => total + BigInt(month.planActual.actualAmountUzs), 0n)
    .toString();
  return {
    category: {
      id,
      code: id,
      name: id,
      expenseTypeSnapshot: type,
    },
    months,
    annual: { ...plan(annualPlanned, annualActual), transactionCount: 0 },
  };
}

function total(rows: MonthlyReportRow[], type?: ExpenseType): PlanActual {
  const selected = type ? rows.filter((item) => item.category.expenseTypeSnapshot === type) : rows;
  const plans = selected.flatMap((item) =>
    item.annual.plannedAmountUzs === null ? [] : [BigInt(item.annual.plannedAmountUzs)],
  );
  const planned = plans.length ? plans.reduce((sum, value) => sum + value, 0n).toString() : null;
  const actual = selected
    .reduce((sum, item) => sum + BigInt(item.annual.actualAmountUzs), 0n)
    .toString();
  return plan(planned, actual);
}

function report(rows: MonthlyReportRow[]): MonthlyReport {
  return {
    year: 2026,
    branchFilter: 'all',
    averagePolicy: {
      code: 'months_with_actual',
      label: 'Fakt mavjud oylar bo‘yicha o‘rtacha',
      denominator: 2,
    },
    rows,
    totals: {
      fixed: total(rows, 'fixed'),
      variable: total(rows, 'variable'),
      overall: total(rows),
    },
  };
}

describe('Oylik hisobot Excel matritsasi', () => {
  const rows = [
    row('rent', 'fixed', [
      { planned: '1200', actual: '80' },
      { planned: null, actual: '20' },
    ]),
    row('salary', 'fixed', [{ planned: '600', actual: '20' }]),
    row('marketing', 'variable', [
      { planned: '300', actual: '25' },
      { planned: null, actual: '5' },
    ]),
  ];
  const matrix = buildMonthlyReportMatrix(report(rows));

  it('doimiy, o‘zgaruvchan va umumiy subtotalni oylar bo‘yicha aniq yig‘adi', () => {
    expect(matrix.fixed.months[0]).toEqual({
      plannedAmountUzs: '1800',
      actualAmountUzs: '100',
      varianceUzs: '1700',
    });
    expect(matrix.variable.months[0]).toEqual({
      plannedAmountUzs: '300',
      actualAmountUzs: '25',
      varianceUzs: '275',
    });
    expect(matrix.overall.months[0]).toEqual({
      plannedAmountUzs: '2100',
      actualAmountUzs: '125',
      varianceUzs: '1975',
    });
  });

  it('reja yo‘q va nol reja holatlarini aralashtirmaydi', () => {
    expect(matrix.overall.months[1]).toEqual({
      plannedAmountUzs: null,
      actualAmountUzs: '25',
      varianceUzs: null,
    });
    expect(matrix.overall.months[2]).toEqual({
      plannedAmountUzs: null,
      actualAmountUzs: '0',
      varianceUzs: null,
    });
  });

  it('Excel C ustunidagi o‘rtacha rejani yillik reja / 12 sifatida hisoblaydi', () => {
    expect(matrix.fixed.averageMonthlyPlanUzs).toBe('150');
    expect(matrix.variable.averageMonthlyPlanUzs).toBe('25');
    expect(matrix.overall.averageMonthlyPlanUzs).toBe('175');
    expect(averageMonthlyPlan(null)).toBeNull();
  });

  it('doimiy xarajat ulushini oylik va yillik hisoblaydi, jami 0 bo‘lsa bo‘sh qoldiradi', () => {
    expect(matrix.fixedShareByMonth[0]).toBe(80);
    expect(matrix.fixedShareByMonth[1]).toBe(80);
    expect(matrix.fixedShareByMonth[2]).toBeNull();
    expect(matrix.fixedShareAnnual).toBe(80);
    expect(percentOfTotal('0', '0')).toBeNull();
  });

  it('katta UZS summalarini JavaScript Number orqali o‘tkazmaydi', () => {
    expect(percentOfTotal('900719925474099300', '1801439850948198600')).toBe(50);
  });
});
