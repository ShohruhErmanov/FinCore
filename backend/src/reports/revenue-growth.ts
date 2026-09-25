import { toMoneyUzs } from '@/common/serialization/financial';
import { MONTHS_SHORT_UZ, percentageValue } from './report-math';

/**
 * Revenue growth, as two separate figures that are never mixed.
 *
 * Monthly and annual growth answer different questions and are computed from
 * different spans, so they are two KPIs rather than one adaptive number that
 * quietly changes meaning when data appears.
 *
 * Monthly growth follows the accounting-period filter: the selected calendar
 * month is compared with the complete preceding calendar month. A running
 * month naturally contains only the revenue posted so far, while the baseline
 * remains the previous month's final total. This is the comparison users see
 * when moving between months in the dashboard.
 *
 * Neither figure is ever estimated. No previous span, or a previous span of
 * zero, yields null and the UI says the comparison is unavailable.
 */

export interface MonthlyRevenueGrowth {
  month: number;
  monthLabel: string;
  previousMonth: number;
  previousMonthLabel: string;
  currentUzs: string;
  previousUzs: string;
  changePct: number | null;
  /** Last day counted on both sides; null when whole months were compared. */
  throughDay: number | null;
}

export interface AnnualRevenueGrowth {
  year: number;
  previousYear: number;
  currentUzs: string;
  previousUzs: string;
  changePct: number | null;
}

export interface RevenueGrowth {
  monthly: MonthlyRevenueGrowth;
  annual: AnnualRevenueGrowth;
}

/** Days in a calendar month, so a 31st never leaks into a 30-day comparison. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface GrowthSpan {
  from: string;
  to: string;
}

export interface MonthlyGrowthSpans {
  current: GrowthSpan;
  previous: GrowthSpan;
  /** Kept for API compatibility; calendar-month comparisons always use null. */
  throughDay: number | null;
  month: number;
  year: number;
  previousMonth: number;
  previousYear: number;
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * The two date ranges the monthly comparison covers.
 *
 * Both sides are complete calendar ranges. For a running selected month the
 * future dates simply have no rows yet, while the previous month still keeps
 * all of its posted revenue.
 */
export function monthlyGrowthSpans(year: number, month: number): MonthlyGrowthSpans {
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;

  return {
    current: { from: iso(year, month, 1), to: iso(year, month, daysInMonth(year, month)) },
    previous: {
      from: iso(previousYear, previousMonth, 1),
      to: iso(previousYear, previousMonth, daysInMonth(previousYear, previousMonth)),
    },
    throughDay: null,
    month,
    year,
    previousMonth,
    previousYear,
  };
}

export function buildRevenueGrowth(
  spans: MonthlyGrowthSpans,
  monthly: { current: bigint; previous: bigint },
  annual: { year: number; current: bigint; previous: bigint },
): RevenueGrowth {
  const change = (current: bigint, previous: bigint) =>
    previous === 0n
      ? null
      : percentageValue(current - previous, previous < 0n ? -previous : previous);

  return {
    monthly: {
      month: spans.month,
      monthLabel: MONTHS_SHORT_UZ[spans.month - 1] ?? String(spans.month),
      previousMonth: spans.previousMonth,
      previousMonthLabel: MONTHS_SHORT_UZ[spans.previousMonth - 1] ?? String(spans.previousMonth),
      currentUzs: toMoneyUzs(monthly.current)!,
      previousUzs: toMoneyUzs(monthly.previous)!,
      changePct: change(monthly.current, monthly.previous),
      throughDay: spans.throughDay,
    },
    annual: {
      year: annual.year,
      previousYear: annual.year - 1,
      currentUzs: toMoneyUzs(annual.current)!,
      previousUzs: toMoneyUzs(annual.previous)!,
      changePct: change(annual.current, annual.previous),
    },
  };
}
