import { toMoneyUzs } from '@/common/serialization/financial';
import { MONTHS_SHORT_UZ, percentageValue } from './report-math';

/**
 * Monthly net profit for a year: what was actually collected, minus what was
 * actually spent.
 *
 * Both sides come from the same net views the rest of the dashboard reads —
 * v_revenue_plan_vs_actual for revenue and the expense report for spending —
 * so a reversed transaction disappears from this figure exactly as it does
 * everywhere else. Nothing is stored; the year is recomputed on every read.
 */

export interface NetProfitMonth {
  month: number;
  label: string;
  revenueUzs: string;
  expenseUzs: string;
  netProfitUzs: string;
  /**
   * Change against the previous month that carried data, as a percentage of
   * that month's magnitude. Null for the first such month, or when the
   * previous one netted exactly zero.
   *
   * In a sparse year this compares months that are far apart, which is why
   * comparedToLabel travels with it: a bare "+4 929 124%" is unreadable, while
   * "Yan oyiga nisbatan" says what the figure actually measures.
   */
  changePct: number | null;
  /** The month changePct is measured against; null when there is no change. */
  comparedToLabel: string | null;
  /** False when neither revenue nor expense was recorded for the month. */
  hasData: boolean;
}

export interface AnnualNetProfit {
  year: number;
  totalNetProfitUzs: string;
  /** Over months with data only: an empty month is not a "worst" month. */
  bestMonth: { month: number; label: string; netProfitUzs: string } | null;
  worstMonth: { month: number; label: string; netProfitUzs: string } | null;
  monthsWithData: number;
  months: NetProfitMonth[];
  paymentMethods: NetProfitPaymentMethod[];
  paymentMethodMonths: NetProfitPaymentMethodMonth[];
}

export interface NetProfitPaymentMethodInput {
  paymentMethodId: string;
  code: string;
  name: string;
  sortOrder: number;
  month: number;
  revenue: bigint;
  expense: bigint;
}

export interface NetProfitPaymentMethod {
  paymentMethodId: string;
  code: string;
  name: string;
  revenueUzs: string;
  expenseUzs: string;
  netProfitUzs: string;
  sharePct: number;
}

export interface NetProfitPaymentMethodMonth {
  month: number;
  label: string;
  totalNetProfitUzs: string;
  paymentMethods: Array<{
    paymentMethodId: string;
    code: string;
    name: string;
    netProfitUzs: string;
  }>;
}

/**
 * Decomposes the existing revenue - expense formula by the shared immutable
 * payment-method dimension. It intentionally accepts every reference method,
 * including inactive historical methods, so no ledger amount disappears into
 * an unnamed "other" bucket.
 */
export function buildNetProfitPaymentMethodBreakdown(rows: NetProfitPaymentMethodInput[]): {
  paymentMethods: NetProfitPaymentMethod[];
  paymentMethodMonths: NetProfitPaymentMethodMonth[];
} {
  const methods = new Map<
    string,
    { paymentMethodId: string; code: string; name: string; sortOrder: number }
  >();
  const byCell = new Map<string, { revenue: bigint; expense: bigint }>();

  for (const row of rows) {
    methods.set(row.paymentMethodId, {
      paymentMethodId: row.paymentMethodId,
      code: row.code,
      name: row.name,
      sortOrder: row.sortOrder,
    });
    const key = `${row.paymentMethodId}:${row.month}`;
    const cell = byCell.get(key) ?? { revenue: 0n, expense: 0n };
    cell.revenue += row.revenue;
    cell.expense += row.expense;
    byCell.set(key, cell);
  }

  const orderedMethods = [...methods.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  const methodTotals = orderedMethods.map((method) => {
    let revenue = 0n;
    let expense = 0n;
    for (let month = 1; month <= 12; month += 1) {
      const cell = byCell.get(`${method.paymentMethodId}:${month}`);
      revenue += cell?.revenue ?? 0n;
      expense += cell?.expense ?? 0n;
    }
    return { ...method, revenue, expense, netProfit: revenue - expense };
  });
  const annualNetProfit = methodTotals.reduce((total, method) => total + method.netProfit, 0n);

  return {
    paymentMethods: methodTotals.map((method) => ({
      paymentMethodId: method.paymentMethodId,
      code: method.code,
      name: method.name,
      revenueUzs: toMoneyUzs(method.revenue)!,
      expenseUzs: toMoneyUzs(method.expense)!,
      netProfitUzs: toMoneyUzs(method.netProfit)!,
      // A zero year is explicitly 0%, never null/NaN/Infinity.
      sharePct: percentageValue(method.netProfit, annualNetProfit) ?? 0,
    })),
    paymentMethodMonths: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const paymentMethods = orderedMethods.map((method) => {
        const cell = byCell.get(`${method.paymentMethodId}:${month}`);
        const netProfit = (cell?.revenue ?? 0n) - (cell?.expense ?? 0n);
        return {
          paymentMethodId: method.paymentMethodId,
          code: method.code,
          name: method.name,
          netProfitUzs: toMoneyUzs(netProfit)!,
        };
      });
      return {
        month,
        label: MONTHS_SHORT_UZ[index] ?? String(month),
        totalNetProfitUzs: toMoneyUzs(
          paymentMethods.reduce((total, method) => total + BigInt(method.netProfitUzs), 0n),
        )!,
        paymentMethods,
      };
    }),
  };
}

export function buildAnnualNetProfit(
  year: number,
  revenueByMonth: Map<number, bigint>,
  expenseByMonth: Map<number, bigint>,
): AnnualNetProfit {
  // The previous month that carried data. A gap must not silently erase the
  // comparison — the reader gets a figure, and is told what it is against.
  let previous: { net: bigint; label: string } | null = null;

  const months: NetProfitMonth[] = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const revenue = revenueByMonth.get(month) ?? 0n;
    const expense = expenseByMonth.get(month) ?? 0n;
    const net = revenue - expense;
    const hasData = revenue !== 0n || expense !== 0n;

    // Measured against the magnitude of the previous month, so a loss that
    // halves reads as an improvement rather than as a sign flip.
    const against = hasData && previous !== null && previous.net !== 0n ? previous : null;
    const changePct = against
      ? percentageValue(net - against.net, against.net < 0n ? -against.net : against.net)
      : null;

    const label = MONTHS_SHORT_UZ[index] ?? String(month);
    if (hasData) previous = { net, label };

    return {
      month,
      label,
      revenueUzs: toMoneyUzs(revenue)!,
      expenseUzs: toMoneyUzs(expense)!,
      netProfitUzs: toMoneyUzs(net)!,
      changePct,
      comparedToLabel: against?.label ?? null,
      hasData,
    };
  });

  const withData = months.filter((row) => row.hasData);
  const total = months.reduce((sum, row) => sum + BigInt(row.netProfitUzs), 0n);

  const extreme = (pick: (a: bigint, b: bigint) => boolean) =>
    withData.reduce<NetProfitMonth | null>(
      (best, row) =>
        best === null || pick(BigInt(row.netProfitUzs), BigInt(best.netProfitUzs)) ? row : best,
      null,
    );

  const best = extreme((a, b) => a > b);
  const worst = extreme((a, b) => a < b);
  const summarise = (row: NetProfitMonth | null) =>
    row ? { month: row.month, label: row.label, netProfitUzs: row.netProfitUzs } : null;

  return {
    year,
    totalNetProfitUzs: toMoneyUzs(total)!,
    bestMonth: summarise(best),
    worstMonth: summarise(worst),
    monthsWithData: withData.length,
    months,
    paymentMethods: [],
    paymentMethodMonths: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      label: MONTHS_SHORT_UZ[index] ?? String(index + 1),
      totalNetProfitUzs: '0',
      paymentMethods: [],
    })),
  };
}
