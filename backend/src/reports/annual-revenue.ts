import { toMoneyUzs } from '@/common/serialization/financial';
import { MONTHS_SHORT_UZ, percentageValue } from './report-math';

/**
 * The revenue half of the annual summary, built the same way the expense half
 * already is: twelve months, an average over the months that actually carried
 * money, a peak, and a comparison against the year before.
 *
 * Nothing is stored. Both figures come from v_revenue_plan_vs_actual, which is
 * the same view the period KPIs read, so the year and the month can never tell
 * different stories.
 */

export interface RevenueMonth {
  month: number;
  label: string;
  actualUzs: string;
  planUzs: string;
  completionPct: number | null;
}

export interface AnnualRevenue {
  year: number;
  totalActualUzs: string;
  totalPlanUzs: string;
  completionPct: number | null;
  /** Averaged over months with revenue, not over twelve — Excel does the same. */
  averageMonthlyUzs: string;
  averageMonthsCount: number;
  peakMonth: { month: number; label: string; actualUzs: string } | null;
  /** Against the previous year. Null when that year recorded nothing. */
  growthPct: number | null;
  previousYear: number;
  previousYearUzs: string;
  months: RevenueMonth[];
}

export interface MonthlyRevenueRow {
  actual: bigint;
  planned: bigint;
}

export function buildAnnualRevenue(
  year: number,
  byMonth: Map<number, MonthlyRevenueRow>,
  previousYearTotal: bigint,
): AnnualRevenue {
  const months: RevenueMonth[] = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const row = byMonth.get(month) ?? { actual: 0n, planned: 0n };
    return {
      month,
      label: MONTHS_SHORT_UZ[index] ?? String(month),
      actualUzs: toMoneyUzs(row.actual)!,
      planUzs: toMoneyUzs(row.planned)!,
      completionPct: percentageValue(row.actual, row.planned),
    };
  });

  const total = months.reduce((sum, row) => sum + BigInt(row.actualUzs), 0n);
  const plan = months.reduce((sum, row) => sum + BigInt(row.planUzs), 0n);
  const earning = months.filter((row) => BigInt(row.actualUzs) > 0n);

  const peak = earning.reduce<RevenueMonth | null>(
    (best, row) =>
      best === null || BigInt(row.actualUzs) > BigInt(best.actualUzs) ? row : best,
    null,
  );

  return {
    year,
    totalActualUzs: toMoneyUzs(total)!,
    totalPlanUzs: toMoneyUzs(plan)!,
    completionPct: percentageValue(total, plan),
    averageMonthlyUzs: toMoneyUzs(earning.length ? total / BigInt(earning.length) : 0n)!,
    averageMonthsCount: earning.length,
    peakMonth: peak
      ? { month: peak.month, label: peak.label, actualUzs: peak.actualUzs }
      : null,
    // Growth is measured against last year's magnitude, so it stays readable
    // even if that year somehow closed negative.
    growthPct:
      previousYearTotal === 0n
        ? null
        : percentageValue(
            total - previousYearTotal,
            previousYearTotal < 0n ? -previousYearTotal : previousYearTotal,
          ),
    previousYear: year - 1,
    previousYearUzs: toMoneyUzs(previousYearTotal)!,
    months,
  };
}

/** (net profit / revenue) x 100. Null when there was no revenue to divide by. */
export function netMarginPct(netProfit: bigint, revenue: bigint): number | null {
  return revenue === 0n ? null : percentageValue(netProfit, revenue);
}
