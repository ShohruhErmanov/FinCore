import { MONTHS_SHORT_UZ, daysInMonth } from '@/common/calendar';
import { toMoneyUzs } from '@/common/serialization/financial';
import type { TrendPoint } from './dashboard.types';
import { distributeDaily, toBigInt } from './report-math';

export interface DashboardTrends {
  expense: TrendPoint[];
  revenue: TrendPoint[];
}

/** A month's plans and its actuals per business date (YYYY-MM-DD). */
export interface DayTrendInput {
  year: number;
  month: number;
  expensePlanned: bigint;
  revenuePlanned: bigint;
  expenseByDay: ReadonlyMap<string, bigint>;
  revenueByDay: ReadonlyMap<string, bigint>;
}

/**
 * The month's trend by day, or by week of seven days (the last one shorter).
 * The plan is monthly; the chart needs a per-day line, so it is spread evenly.
 */
export function buildDayTrends(
  granularity: 'daily' | 'weekly',
  input: DayTrendInput,
): DashboardTrends {
  const days = daysInMonth(input.year, input.month);
  const prefix = `${input.year}-${String(input.month).padStart(2, '0')}`;
  const expensePlanDaily = distributeDaily(input.expensePlanned, days);
  const revenuePlanDaily = distributeDaily(input.revenuePlanned, days);

  const rows = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = `${prefix}-${String(day).padStart(2, '0')}`;
    return {
      day,
      date,
      expensePlan: expensePlanDaily[index] ?? 0n,
      expenseActual: input.expenseByDay.get(date) ?? 0n,
      revenuePlan: revenuePlanDaily[index] ?? 0n,
      revenueActual: input.revenueByDay.get(date) ?? 0n,
    };
  });

  if (granularity === 'daily')
    return {
      expense: rows.map((row) => ({
        bucket: row.date,
        label: String(row.day),
        planUzs: toMoneyUzs(row.expensePlan)!,
        actualUzs: toMoneyUzs(row.expenseActual)!,
      })),
      revenue: rows.map((row) => ({
        bucket: row.date,
        label: String(row.day),
        planUzs: toMoneyUzs(row.revenuePlan)!,
        actualUzs: toMoneyUzs(row.revenueActual)!,
      })),
    };

  const expense: TrendPoint[] = [];
  const revenue: TrendPoint[] = [];
  for (let start = 1, index = 0; start <= days; start += 7, index += 1) {
    const end = Math.min(start + 6, days);
    const week = rows.filter((row) => row.day >= start && row.day <= end);
    const bucket = `${prefix}-W${index + 1}`;
    const label = `${start}–${end}`;
    const sum = (pick: (row: (typeof rows)[number]) => bigint) =>
      toMoneyUzs(week.reduce((total, row) => total + pick(row), 0n))!;
    expense.push({
      bucket,
      label,
      planUzs: sum((row) => row.expensePlan),
      actualUzs: sum((row) => row.expenseActual),
    });
    revenue.push({
      bucket,
      label,
      planUzs: sum((row) => row.revenuePlan),
      actualUzs: sum((row) => row.revenueActual),
    });
  }
  return { expense, revenue };
}

/** One month of a yearly plan-vs-actual aggregate. */
export interface MonthTotalsRow {
  month: number;
  planned: unknown;
  actual: unknown;
}

/** The year's trend by month: twelve points, a month without rows reading zero. */
export function buildMonthTrends(
  year: number,
  expenseRows: readonly MonthTotalsRow[],
  revenueRows: readonly MonthTotalsRow[],
): DashboardTrends {
  const point = (rows: readonly MonthTotalsRow[], index: number): TrendPoint => {
    const row = rows.find((candidate) => Number(candidate.month) === index + 1);
    return {
      bucket: `${year}-${String(index + 1).padStart(2, '0')}`,
      label: MONTHS_SHORT_UZ[index] ?? String(index + 1),
      planUzs: toMoneyUzs(toBigInt(row?.planned))!,
      actualUzs: toMoneyUzs(toBigInt(row?.actual))!,
    };
  };
  return {
    expense: Array.from({ length: 12 }, (_, index) => point(expenseRows, index)),
    revenue: Array.from({ length: 12 }, (_, index) => point(revenueRows, index)),
  };
}
