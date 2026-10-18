import { MONTHS_SHORT_UZ } from '@/common/calendar';
import { toMoneyUzs } from '@/common/serialization/financial';
import type { DashboardResponse } from './dashboard.types';
import { percentageValue, toBigInt } from './report-math';

/** One v_monthly_expense_report aggregate: a month and expense type of a year. */
export interface AnnualExpenseMonthRow {
  month: number;
  expense_type: 'fixed' | 'variable';
  actual_uzs: unknown;
  planned_amount_uzs: unknown;
}

/** Excel «Xulosa» sheet: yearly split, fixed share and the peak month. */
export function buildAnnualExpenseSummary(
  year: number,
  rows: readonly AnnualExpenseMonthRow[],
): DashboardResponse['annual'] {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const forMonth = rows.filter((row) => Number(row.month) === month);
    const fixed = toBigInt(forMonth.find((row) => row.expense_type === 'fixed')?.actual_uzs);
    const variable = toBigInt(forMonth.find((row) => row.expense_type === 'variable')?.actual_uzs);
    const actual = fixed + variable;
    const plan = forMonth.reduce((total, row) => total + toBigInt(row.planned_amount_uzs), 0n);
    return {
      month,
      label: MONTHS_SHORT_UZ[index] ?? String(month),
      fixedUzs: toMoneyUzs(fixed)!,
      variableUzs: toMoneyUzs(variable)!,
      actualUzs: toMoneyUzs(actual)!,
      planUzs: toMoneyUzs(plan)!,
      varianceUzs: toMoneyUzs(plan - actual)!,
      completionPct: percentageValue(actual, plan),
    };
  });

  const totalActual = months.reduce((total, row) => total + BigInt(row.actualUzs), 0n);
  const fixedActual = months.reduce((total, row) => total + BigInt(row.fixedUzs), 0n);
  const totalPlan = months.reduce((total, row) => total + BigInt(row.planUzs), 0n);
  // Excel counts the average over months that actually have spending.
  const monthsWithActual = months.filter((row) => BigInt(row.actualUzs) > 0n);
  // Excel «O‘rtacha kiritilgan oylik reja» counts only months with a positive plan.
  const monthsWithPlan = months.filter((row) => BigInt(row.planUzs) > 0n);
  const plannedMonthsTotal = monthsWithPlan.reduce((total, row) => total + BigInt(row.planUzs), 0n);
  const peak = monthsWithActual.reduce<(typeof months)[number] | null>(
    (best, row) => (best === null || BigInt(row.actualUzs) > BigInt(best.actualUzs) ? row : best),
    null,
  );

  return {
    year,
    totalActualUzs: toMoneyUzs(totalActual)!,
    fixedActualUzs: toMoneyUzs(fixedActual)!,
    variableActualUzs: toMoneyUzs(totalActual - fixedActual)!,
    fixedSharePct: percentageValue(fixedActual, totalActual),
    totalPlanUzs: toMoneyUzs(totalPlan)!,
    varianceUzs: toMoneyUzs(totalPlan - totalActual)!,
    averageMonthlyUzs: monthsWithActual.length
      ? toMoneyUzs(totalActual / BigInt(monthsWithActual.length))!
      : '0',
    averageMonthsCount: monthsWithActual.length,
    averagePlannedMonthlyUzs: monthsWithPlan.length
      ? toMoneyUzs(plannedMonthsTotal / BigInt(monthsWithPlan.length))!
      : '0',
    averagePlanMonthsCount: monthsWithPlan.length,
    peakMonth: peak ? { month: peak.month, label: peak.label, actualUzs: peak.actualUzs } : null,
    months,
  };
}
