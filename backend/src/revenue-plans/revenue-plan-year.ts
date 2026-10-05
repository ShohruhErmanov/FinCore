import { MONTHS_SHORT_UZ, percentageValue } from '@/reports/report-math';

/**
 * Every month's revenue plan on one page — what the director entered, branch by
 * branch, against what came in.
 *
 * Completion is measured only where a plan exists. A month where Sayxun has a
 * plan and Xalqlar do'stligi has none compares Sayxun's revenue to Sayxun's
 * plan; Xalqlar's revenue that month is real, and is counted in actualAmountUzs, but
 * it was never promised against anything, so letting it inflate the percentage
 * would report a plan as beaten that nobody set.
 */

/** One row of v_revenue_plan_vs_actual: a (period, active branch) pair. */
export interface PlanYearRow {
  month: number;
  periodId: string;
  branchId: string;
  branchName: string;
  /** null — no applicable plan, which is not the same as a plan of zero. */
  plannedUzs: bigint | null;
  actualUzs: bigint;
}

export interface PlanYearBranchCell {
  branchId: string;
  plannedAmountUzs: string | null;
  actualAmountUzs: string;
  completionPercent: number | null;
}

export interface PlanYearMonth {
  month: number;
  label: string;
  /** null when the accounting period for that month has not been opened. */
  periodId: string | null;
  /** Sum of the branches that have a plan; null when none of them do. */
  plannedAmountUzs: string | null;
  /** Every posted revenue that month, planned or not. */
  actualAmountUzs: string;
  /** Revenue of the branches that had a plan — what completion is measured on. */
  actualAgainstPlanUzs: string;
  completionPercent: number | null;
  branches: PlanYearBranchCell[];
}

export interface PlanYearBranchTotal {
  branchId: string;
  branchName: string;
  plannedAmountUzs: string;
  actualAmountUzs: string;
  actualAgainstPlanUzs: string;
  completionPercent: number | null;
  plannedMonths: number;
}

export interface RevenuePlanYear {
  year: number;
  plannedAmountUzs: string;
  actualAmountUzs: string;
  actualAgainstPlanUzs: string;
  completionPercent: number | null;
  /** Months where at least one branch has a plan. */
  plannedMonths: number;
  branches: PlanYearBranchTotal[];
  months: PlanYearMonth[];
}

interface Totals {
  planned: bigint;
  actual: bigint;
  againstPlan: bigint;
  plannedMonths: number;
}

const zero = (): Totals => ({ planned: 0n, actual: 0n, againstPlan: 0n, plannedMonths: 0 });

/** Completion against a plan; a plan of zero has no meaningful percentage. */
const completion = (actual: bigint, planned: bigint | null) =>
  planned === null || planned === 0n ? null : percentageValue(actual, planned);

export function buildRevenuePlanYear(year: number, rows: PlanYearRow[]): RevenuePlanYear {
  // Branch order follows the rows (the query sorts by name), so the columns
  // read the same way as the monthly board above them.
  const branchNames = new Map<string, string>();
  for (const row of rows)
    if (!branchNames.has(row.branchId)) branchNames.set(row.branchId, row.branchName);
  const branchIds = [...branchNames.keys()];

  const byBranch = new Map(branchIds.map((id) => [id, zero()] as const));
  const yearTotals = zero();

  const months: PlanYearMonth[] = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthRows = rows.filter((row) => row.month === month);
    const cells = new Map(monthRows.map((row) => [row.branchId, row] as const));

    let planned: bigint | null = null;
    let actual = 0n;
    let againstPlan = 0n;
    const branches: PlanYearBranchCell[] = [];

    for (const branchId of branchIds) {
      const cell = cells.get(branchId);
      const cellPlanned = cell?.plannedUzs ?? null;
      const cellActual = cell?.actualUzs ?? 0n;
      const totals = byBranch.get(branchId)!;

      actual += cellActual;
      totals.actual += cellActual;
      if (cellPlanned !== null) {
        planned = (planned ?? 0n) + cellPlanned;
        againstPlan += cellActual;
        totals.planned += cellPlanned;
        totals.againstPlan += cellActual;
        totals.plannedMonths += 1;
      }

      branches.push({
        branchId,
        plannedAmountUzs: cellPlanned === null ? null : cellPlanned.toString(),
        actualAmountUzs: cellActual.toString(),
        completionPercent: completion(cellActual, cellPlanned),
      });
    }

    yearTotals.actual += actual;
    if (planned !== null) {
      yearTotals.planned += planned;
      yearTotals.againstPlan += againstPlan;
      yearTotals.plannedMonths += 1;
    }

    return {
      month,
      label: MONTHS_SHORT_UZ[index]!,
      periodId: monthRows[0]?.periodId ?? null,
      plannedAmountUzs: planned === null ? null : planned.toString(),
      actualAmountUzs: actual.toString(),
      actualAgainstPlanUzs: againstPlan.toString(),
      completionPercent: completion(againstPlan, planned),
      branches,
    };
  });

  return {
    year,
    plannedAmountUzs: yearTotals.planned.toString(),
    actualAmountUzs: yearTotals.actual.toString(),
    actualAgainstPlanUzs: yearTotals.againstPlan.toString(),
    completionPercent: completion(
      yearTotals.againstPlan,
      yearTotals.plannedMonths ? yearTotals.planned : null,
    ),
    plannedMonths: yearTotals.plannedMonths,
    branches: branchIds.map((branchId) => {
      const totals = byBranch.get(branchId)!;
      return {
        branchId,
        branchName: branchNames.get(branchId)!,
        plannedAmountUzs: totals.planned.toString(),
        actualAmountUzs: totals.actual.toString(),
        actualAgainstPlanUzs: totals.againstPlan.toString(),
        completionPercent: completion(
          totals.againstPlan,
          totals.plannedMonths ? totals.planned : null,
        ),
        plannedMonths: totals.plannedMonths,
      };
    }),
    months,
  };
}
