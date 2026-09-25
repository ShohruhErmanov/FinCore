import type {
  ExpenseType,
  MoneyUzs,
  MonthlyReport,
  MonthlyReportRow,
  PlanActual,
} from '@/shared/types/domain';

export interface MonthlyMoneySummary {
  plannedAmountUzs: MoneyUzs | null;
  actualAmountUzs: MoneyUzs;
  varianceUzs: MoneyUzs | null;
}

export interface MonthlyReportSectionSummary {
  type: ExpenseType | 'overall';
  months: MonthlyMoneySummary[];
  annual: PlanActual;
  averageMonthlyPlanUzs: MoneyUzs | null;
}

export interface MonthlyReportMatrixSummary {
  fixed: MonthlyReportSectionSummary;
  variable: MonthlyReportSectionSummary;
  overall: MonthlyReportSectionSummary;
  fixedShareByMonth: Array<number | null>;
  fixedShareAnnual: number | null;
}

export interface MonthlyCategoryResult {
  id: string;
  name: string;
  type: ExpenseType;
  planActual: PlanActual;
  transactionCount: number;
  sharePct: number | null;
}

export interface MonthlyExecutiveSummary {
  month: number;
  monthLabel: string;
  fixed: PlanActual;
  variable: PlanActual;
  overall: PlanActual;
  fixedSharePct: number | null;
  variableSharePct: number | null;
  fixedCategoryCount: number;
  variableCategoryCount: number;
  categories: MonthlyCategoryResult[];
}

const MONTH_COUNT = 12n;

function summarizeRows(rows: MonthlyReportRow[], monthIndex?: number): MonthlyMoneySummary {
  let planned: bigint | null = null;
  let actual = 0n;

  for (const row of rows) {
    const value = monthIndex === undefined ? row.annual : row.months[monthIndex]?.planActual;
    if (!value) continue;
    actual += BigInt(value.actualAmountUzs);
    if (value.plannedAmountUzs !== null) planned = (planned ?? 0n) + BigInt(value.plannedAmountUzs);
  }

  return {
    plannedAmountUzs: planned?.toString() ?? null,
    actualAmountUzs: actual.toString(),
    varianceUzs: planned === null ? null : (planned - actual).toString(),
  };
}

/** Excel'dagi C ustun: tanlangan yil rejasi / 12 kalendar oy. */
export function averageMonthlyPlan(plannedAmountUzs: MoneyUzs | null): MoneyUzs | null {
  if (plannedAmountUzs === null) return null;
  return (BigInt(plannedAmountUzs) / MONTH_COUNT).toString();
}

/** Ikki xona aniqlikdagi ulush; jami 0 bo'lsa mazmunli foiz mavjud emas. */
export function percentOfTotal(partUzs: MoneyUzs, totalUzs: MoneyUzs): number | null {
  const total = BigInt(totalUzs);
  if (total === 0n) return null;
  const part = BigInt(partUzs);
  const scaled = part * 10_000n;
  const rounded = (scaled + total / 2n) / total;
  return Number(rounded) / 100;
}

function buildSection(
  report: MonthlyReport,
  type: ExpenseType | 'overall',
): MonthlyReportSectionSummary {
  const rows =
    type === 'overall'
      ? report.rows
      : report.rows.filter((row) => row.category.expenseTypeSnapshot === type);
  const annual = type === 'overall' ? report.totals.overall : report.totals[type];

  return {
    type,
    months: Array.from({ length: 12 }, (_, index) => summarizeRows(rows, index)),
    annual,
    averageMonthlyPlanUzs: averageMonthlyPlan(annual.plannedAmountUzs),
  };
}

/** Oylik subtotalni UI uchun mavjud PlanActual contractiga aniqlikni yo‘qotmasdan o‘giradi. */
export function monthlySummaryPlanActual(value: MonthlyMoneySummary): PlanActual {
  const actual = BigInt(value.actualAmountUzs);
  const planned = value.plannedAmountUzs === null ? null : BigInt(value.plannedAmountUzs);
  const completionPercent =
    planned === null || planned === 0n
      ? null
      : Number((actual * 10_000n + planned / 2n) / planned) / 100;
  return {
    hasPlan: planned !== null,
    plannedAmountUzs: value.plannedAmountUzs,
    actualAmountUzs: value.actualAmountUzs,
    varianceUzs: value.varianceUzs,
    completionPercent,
    status:
      planned === null
        ? actual > 0n
          ? 'unplanned'
          : 'no_plan'
        : actual > planned
          ? 'over_plan'
          : actual < planned
            ? 'under_plan'
            : 'on_plan',
  };
}

/**
 * Excel matritsasidagi subtotal, umumiy jami va doimiy xarajat ulushini
 * backend qaytargan kategoriya kesimidan hosil qiladi. Pul hisoblari Number
 * orqali o'tmaydi, shuning uchun katta UZS summalarida aniqlik yo'qolmaydi.
 */
export function buildMonthlyReportMatrix(report: MonthlyReport): MonthlyReportMatrixSummary {
  const fixed = buildSection(report, 'fixed');
  const variable = buildSection(report, 'variable');
  const overall = buildSection(report, 'overall');

  return {
    fixed,
    variable,
    overall,
    fixedShareByMonth: fixed.months.map((month, index) =>
      percentOfTotal(month.actualAmountUzs, overall.months[index]!.actualAmountUzs),
    ),
    fixedShareAnnual: percentOfTotal(fixed.annual.actualAmountUzs, overall.annual.actualAmountUzs),
  };
}

/** Tanlangan oy uchun executive UI ishlatadigan, server qatorlaridan olingan yagona view-model. */
export function buildMonthlyExecutiveSummary(
  report: MonthlyReport,
  requestedMonth: number,
): MonthlyExecutiveSummary {
  const monthNames = [
    'Yanvar',
    'Fevral',
    'Mart',
    'Aprel',
    'May',
    'Iyun',
    'Iyul',
    'Avgust',
    'Sentabr',
    'Oktabr',
    'Noyabr',
    'Dekabr',
  ];
  const month = Math.max(1, Math.min(requestedMonth, 12));
  const monthIndex = month - 1;
  const matrix = buildMonthlyReportMatrix(report);
  const overall = monthlySummaryPlanActual(matrix.overall.months[monthIndex]!);
  const fixed = monthlySummaryPlanActual(matrix.fixed.months[monthIndex]!);
  const variable = monthlySummaryPlanActual(matrix.variable.months[monthIndex]!);
  const categories = report.rows
    .map((row) => {
      const cell = row.months.find((item) => item.month === month);
      if (!cell) return null;
      return {
        id: row.category.id,
        name: row.category.name,
        type: row.category.expenseTypeSnapshot,
        planActual: cell.planActual,
        transactionCount: cell.transactionCount,
        sharePct: percentOfTotal(cell.planActual.actualAmountUzs, overall.actualAmountUzs),
      } satisfies MonthlyCategoryResult;
    })
    .filter((item): item is MonthlyCategoryResult => item !== null)
    .sort((a, b) => {
      const left = BigInt(a.planActual.actualAmountUzs);
      const right = BigInt(b.planActual.actualAmountUzs);
      return left === right ? a.name.localeCompare(b.name) : left > right ? -1 : 1;
    });
  const activeCategories = categories.filter(
    (item) =>
      BigInt(item.planActual.actualAmountUzs) !== 0n || item.planActual.plannedAmountUzs !== null,
  );

  return {
    month,
    monthLabel: monthNames[monthIndex] ?? String(month),
    fixed,
    variable,
    overall,
    fixedSharePct: percentOfTotal(fixed.actualAmountUzs, overall.actualAmountUzs),
    variableSharePct: percentOfTotal(variable.actualAmountUzs, overall.actualAmountUzs),
    fixedCategoryCount: activeCategories.filter((item) => item.type === 'fixed').length,
    variableCategoryCount: activeCategories.filter((item) => item.type === 'variable').length,
    categories,
  };
}
