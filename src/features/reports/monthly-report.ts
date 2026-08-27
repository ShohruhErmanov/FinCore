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
