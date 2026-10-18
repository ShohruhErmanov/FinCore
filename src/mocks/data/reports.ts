import type {
  AccountingPeriod,
  AnnualExpenseSummary,
  AnnualNetProfit,
  AnnualRevenue,
  DashboardResponse,
  RevenueGrowth,
  AuthenticatedUser,
  Expense,
  ExpenseAnalytics,
  MoneyUzs,
  TrendGranularity,
  TrendPoint,
} from '@/shared/types/domain';
import { branches, historicalMonthly } from '../fixtures';
import {
  branchSharePercent,
  monthlyExpenseActualUzs,
  monthlyExpensePlanUzs,
  monthlyRevenueActualUzs,
  monthlyRevenuePlanUzs,
} from './revenue';
import {
  daysInMonth,
  distributeDaily,
  monthShortNames,
  percentageValue,
  sumMoney,
} from '../support/money';
import { db, periodRows } from '../state';
import { buildBudgetPlan } from './budget';
import { canUseBranch, hasPermission } from '../support/http';

function buildTrends(
  granularity: TrendGranularity,
  period: AccountingPeriod,
  branchIds: Set<string>,
): { expense: TrendPoint[]; revenue: TrendPoint[] } {
  if (granularity === 'monthly') {
    const revenueShare = branchSharePercent(branchIds, 'revenue');
    const expenseShare = branchSharePercent(branchIds, 'expense');
    const expense: TrendPoint[] = [];
    const revenue: TrendPoint[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const bucket = `${period.year}-${String(month).padStart(2, '0')}`;
      const label = monthShortNames[month - 1] ?? String(month);
      const monthPeriod = periodRows.find((row) => row.year === period.year && row.month === month);
      const seed = historicalMonthly.find((row) => row.month === month);
      if (monthPeriod) {
        expense.push({
          bucket,
          label,
          planUzs: monthlyExpensePlanUzs(monthPeriod.id, branchIds),
          actualUzs: monthlyExpenseActualUzs(monthPeriod.id, branchIds),
        });
        revenue.push({
          bucket,
          label,
          planUzs: monthlyRevenuePlanUzs(monthPeriod.id, branchIds),
          actualUzs: monthlyRevenueActualUzs(monthPeriod.id, branchIds),
        });
      } else if (seed) {
        expense.push({
          bucket,
          label,
          planUzs: ((BigInt(seed.expensePlanUzs) * expenseShare) / 100n).toString(),
          actualUzs: ((BigInt(seed.expenseActualUzs) * expenseShare) / 100n).toString(),
        });
        revenue.push({
          bucket,
          label,
          planUzs: ((BigInt(seed.revenuePlanUzs) * revenueShare) / 100n).toString(),
          actualUzs: ((BigInt(seed.revenueActualUzs) * revenueShare) / 100n).toString(),
        });
      } else {
        expense.push({ bucket, label, planUzs: '0', actualUzs: '0' });
        revenue.push({ bucket, label, planUzs: '0', actualUzs: '0' });
      }
    }
    return { expense, revenue };
  }

  const days = daysInMonth(period.year, period.month);
  const monthPrefix = `${period.year}-${String(period.month).padStart(2, '0')}`;
  const revenuePlanDaily = distributeDaily(
    BigInt(monthlyRevenuePlanUzs(period.id, branchIds)),
    days,
  );
  const expensePlanDaily = distributeDaily(
    BigInt(monthlyExpensePlanUzs(period.id, branchIds)),
    days,
  );
  const dailyRows = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    return {
      day,
      date,
      revenuePlan: revenuePlanDaily[index] ?? 0n,
      revenueActual: db.revenueRows
        .filter((row) => row.businessDate === date && branchIds.has(row.branchId))
        .reduce((total, row) => total + BigInt(row.totalUzs), 0n),
      expensePlan: expensePlanDaily[index] ?? 0n,
      expenseActual: db.expenseRows
        .filter((row) => row.transactionDate === date && branchIds.has(row.branchId))
        .reduce((total, row) => total + BigInt(row.amountUzs), 0n),
    };
  });

  if (granularity === 'daily')
    return {
      expense: dailyRows.map((row) => ({
        bucket: row.date,
        label: String(row.day),
        planUzs: row.expensePlan.toString(),
        actualUzs: row.expenseActual.toString(),
      })),
      revenue: dailyRows.map((row) => ({
        bucket: row.date,
        label: String(row.day),
        planUzs: row.revenuePlan.toString(),
        actualUzs: row.revenueActual.toString(),
      })),
    };

  const expense: TrendPoint[] = [];
  const revenue: TrendPoint[] = [];
  for (let start = 1, index = 0; start <= days; start += 7, index += 1) {
    const end = Math.min(start + 6, days);
    const rows = dailyRows.filter((row) => row.day >= start && row.day <= end);
    const bucket = `${monthPrefix}-W${index + 1}`;
    const label = `${start}–${end}`;
    const sum = (pick: (row: (typeof dailyRows)[number]) => bigint) =>
      rows.reduce((total, row) => total + pick(row), 0n).toString();
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

function monthlyExpenseByType(
  periodId: string,
  branchIds: Set<string>,
  type: 'fixed' | 'variable',
): MoneyUzs {
  return sumMoney(
    db.expenseRows
      .filter(
        (row) =>
          row.periodId === periodId &&
          branchIds.has(row.branchId) &&
          row.expenseTypeSnapshot === type,
      )
      .map((row) => row.amountUzs),
  );
}

/** Excel «Xulosa» varag‘i: yillik kesim + oylik dinamika jadvali. */
/**
 * Net profit per month, derived from the same mock revenue and expense the rest
 * of the dashboard fixture uses — so the mock tells the same story the server
 * does rather than inventing a second one.
 */
/**
 * Monthly and annual revenue growth, kept as two figures like the server does.
 *
 * The mock seeds whole months only, so the month-to-date comparison has nothing
 * finer to work with — it reports whole months (throughDay: null) rather than
 * inventing daily rows the fixture does not have.
 */
function buildRevenueGrowth(year: number, month: number, branchIds: Set<string>): RevenueGrowth {
  const revenue = buildAnnualRevenue(year, branchIds);
  const current = revenue.months.find((row) => row.month === month);
  const previousMonth = month === 1 ? 12 : month - 1;
  const previous =
    month === 1 ? undefined : revenue.months.find((row) => row.month === previousMonth);

  const currentUzs = current?.actualUzs ?? '0';
  const previousUzs = previous?.actualUzs ?? '0';

  return {
    monthly: {
      month,
      monthLabel: monthShortNames[month - 1] ?? String(month),
      previousMonth,
      previousMonthLabel: monthShortNames[previousMonth - 1] ?? String(previousMonth),
      currentUzs,
      previousUzs,
      changePct:
        previousUzs === '0'
          ? null
          : percentageValue((BigInt(currentUzs) - BigInt(previousUzs)).toString(), previousUzs),
      throughDay: null,
    },
    annual: {
      year,
      previousYear: year - 1,
      currentUzs: revenue.totalActualUzs,
      previousUzs: '0',
      // One seeded year, so there is nothing to compare against.
      changePct: null,
    },
  };
}

/** The revenue half of the annual summary, from the same seeded months. */
function buildAnnualRevenue(year: number, branchIds: Set<string>): AnnualRevenue {
  const share = branchSharePercent(branchIds, 'revenue');
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const seed = historicalMonthly.find((row) => row.month === month);
    const actual = seed ? (BigInt(seed.revenueActualUzs) * share) / 100n : 0n;
    const planned = seed ? (BigInt(seed.revenuePlanUzs) * share) / 100n : 0n;
    return {
      month,
      label: monthShortNames[index] ?? String(month),
      actualUzs: actual.toString(),
      planUzs: planned.toString(),
      completionPct: percentageValue(actual.toString(), planned.toString()),
    };
  });

  const total = months.reduce((sum, row) => sum + BigInt(row.actualUzs), 0n);
  const plan = months.reduce((sum, row) => sum + BigInt(row.planUzs), 0n);
  const earning = months.filter((row) => BigInt(row.actualUzs) > 0n);
  const peak = earning.reduce<(typeof months)[number] | null>(
    (best, row) => (best === null || BigInt(row.actualUzs) > BigInt(best.actualUzs) ? row : best),
    null,
  );

  return {
    year,
    totalActualUzs: total.toString(),
    totalPlanUzs: plan.toString(),
    completionPct: percentageValue(total.toString(), plan.toString()),
    averageMonthlyUzs: (earning.length ? total / BigInt(earning.length) : 0n).toString(),
    averageMonthsCount: earning.length,
    peakMonth: peak ? { month: peak.month, label: peak.label, actualUzs: peak.actualUzs } : null,
    // The mock seeds one year only, so there is nothing to compare against.
    growthPct: null,
    previousYear: year - 1,
    previousYearUzs: '0',
    months,
  };
}

function buildAnnualNetProfit(year: number, branchIds: Set<string>): AnnualNetProfit {
  const annual = buildAnnualSummary(year, branchIds);
  const revenueShare = branchSharePercent(branchIds, 'revenue');

  let previous: { net: bigint; label: string } | null = null;
  const months = annual.months.map((row, index) => {
    const seed = historicalMonthly.find((item) => item.month === row.month);
    const revenue = seed ? (BigInt(seed.revenueActualUzs ?? '0') * revenueShare) / 100n : 0n;
    const expense = BigInt(row.actualUzs);
    const net = revenue - expense;
    const hasData = revenue !== 0n || expense !== 0n;
    const against = hasData && previous !== null && previous.net !== 0n ? previous : null;
    const changePct = against
      ? percentageValue(
          (net - against.net).toString(),
          (against.net < 0n ? -against.net : against.net).toString(),
        )
      : null;
    const label = monthShortNames[index] ?? String(row.month);
    if (hasData) previous = { net, label };

    return {
      month: row.month,
      label,
      revenueUzs: revenue.toString(),
      expenseUzs: expense.toString(),
      netProfitUzs: net.toString(),
      changePct,
      comparedToLabel: against?.label ?? null,
      hasData,
    };
  });

  const withData = months.filter((row) => row.hasData);
  const pick = (better: (a: bigint, b: bigint) => boolean) => {
    const found = withData.reduce<(typeof months)[number] | null>(
      (best, row) =>
        best === null || better(BigInt(row.netProfitUzs), BigInt(best.netProfitUzs)) ? row : best,
      null,
    );
    return found
      ? { month: found.month, label: found.label, netProfitUzs: found.netProfitUzs }
      : null;
  };

  const totalNetProfitUzs = months
    .reduce((sum, row) => sum + BigInt(row.netProfitUzs), 0n)
    .toString();
  const totalRevenueUzs = months.reduce((sum, row) => sum + BigInt(row.revenueUzs), 0n);

  return {
    year,
    totalNetProfitUzs,
    netMarginPct:
      totalRevenueUzs === 0n
        ? null
        : percentageValue(totalNetProfitUzs, totalRevenueUzs.toString()),
    bestMonth: pick((a, b) => a > b),
    worstMonth: pick((a, b) => a < b),
    monthsWithData: withData.length,
    months,
    paymentMethods: [],
    paymentMethodMonths: months.map((month) => ({
      month: month.month,
      label: month.label,
      totalNetProfitUzs: month.netProfitUzs,
      paymentMethods: [],
    })),
  };
}

function buildAnnualSummary(year: number, branchIds: Set<string>): AnnualExpenseSummary {
  const expenseShare = branchSharePercent(branchIds, 'expense');
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const label = monthShortNames[index] ?? String(month);
    const period = periodRows.find((row) => row.year === year && row.month === month);
    const seed = historicalMonthly.find((row) => row.month === month);
    let fixedUzs = '0';
    let variableUzs = '0';
    let planUzs = '0';
    if (period) {
      fixedUzs = monthlyExpenseByType(period.id, branchIds, 'fixed');
      variableUzs = monthlyExpenseByType(period.id, branchIds, 'variable');
      planUzs = monthlyExpensePlanUzs(period.id, branchIds);
    } else if (seed) {
      const scale = (value: MoneyUzs) => ((BigInt(value) * expenseShare) / 100n).toString();
      fixedUzs = scale(seed.expenseFixedUzs);
      variableUzs = (BigInt(scale(seed.expenseActualUzs)) - BigInt(fixedUzs)).toString();
      planUzs = scale(seed.expensePlanUzs);
    }
    const actualUzs = sumMoney([fixedUzs, variableUzs]);
    return {
      month,
      label,
      fixedUzs,
      variableUzs,
      actualUzs,
      planUzs,
      varianceUzs: (BigInt(planUzs) - BigInt(actualUzs)).toString(),
      completionPct: percentageValue(actualUzs, planUzs),
    };
  });
  const totalActualUzs = sumMoney(months.map((row) => row.actualUzs));
  const fixedActualUzs = sumMoney(months.map((row) => row.fixedUzs));
  const totalPlanUzs = sumMoney(months.map((row) => row.planUzs));
  // Excel «O‘rtacha oylik xarajat» — faqat fakt kiritilgan oylar bo‘yicha.
  const monthsWithActual = months.filter((row) => BigInt(row.actualUzs) > 0n);
  const monthsWithPlan = months.filter((row) => BigInt(row.planUzs) > 0n);
  const plannedMonthsTotal = sumMoney(monthsWithPlan.map((row) => row.planUzs));
  const peak = monthsWithActual.reduce<(typeof months)[number] | null>(
    (best, row) => (best === null || BigInt(row.actualUzs) > BigInt(best.actualUzs) ? row : best),
    null,
  );
  return {
    year,
    totalActualUzs,
    fixedActualUzs,
    variableActualUzs: (BigInt(totalActualUzs) - BigInt(fixedActualUzs)).toString(),
    fixedSharePct: percentageValue(fixedActualUzs, totalActualUzs),
    totalPlanUzs,
    varianceUzs: (BigInt(totalPlanUzs) - BigInt(totalActualUzs)).toString(),
    averageMonthlyUzs: monthsWithActual.length
      ? (BigInt(totalActualUzs) / BigInt(monthsWithActual.length)).toString()
      : '0',
    averageMonthsCount: monthsWithActual.length,
    averagePlannedMonthlyUzs: monthsWithPlan.length
      ? (BigInt(plannedMonthsTotal) / BigInt(monthsWithPlan.length)).toString()
      : '0',
    averagePlanMonthsCount: monthsWithPlan.length,
    peakMonth: peak ? { month: peak.month, label: peak.label, actualUzs: peak.actualUzs } : null,
    months,
  };
}

export function buildDashboard(
  branchId: string | null,
  periodId: string,
  granularity: TrendGranularity,
  canViewNetProfit = true,
): DashboardResponse {
  const selectedBranches = branches.filter((branch) => !branchId || branch.id === branchId);
  const selectedBranchIds = new Set(selectedBranches.map((branch) => branch.id));
  const period = periodRows.find((row) => row.id === periodId)!;
  const planLines = buildBudgetPlan(periodId).lines.filter((line) =>
    selectedBranchIds.has(line.branchId),
  );
  const expensePlanUzs = sumMoney(
    planLines.filter((line) => line.hasPlan).map((line) => line.plannedAmountUzs ?? '0'),
  );
  const expenseActualUzs = monthlyExpenseActualUzs(periodId, selectedBranchIds);
  const fixedExpenseUzs = sumMoney(
    db.expenseRows
      .filter(
        (row) =>
          row.periodId === periodId &&
          selectedBranchIds.has(row.branchId) &&
          row.expenseTypeSnapshot === 'fixed',
      )
      .map((row) => row.amountUzs),
  );
  const variableExpenseUzs = sumMoney(
    db.expenseRows
      .filter(
        (row) =>
          row.periodId === periodId &&
          selectedBranchIds.has(row.branchId) &&
          row.expenseTypeSnapshot === 'variable',
      )
      .map((row) => row.amountUzs),
  );
  const revenuePlanUzs = monthlyRevenuePlanUzs(periodId, selectedBranchIds);
  const revenueActualUzs = monthlyRevenueActualUzs(periodId, selectedBranchIds);
  const trends = buildTrends(granularity, period, selectedBranchIds);
  const branchMetrics = selectedBranches.map((branch) => {
    const single = new Set([branch.id]);
    const branchExpensePlanUzs = sumMoney(
      planLines
        .filter((line) => line.branchId === branch.id && line.hasPlan)
        .map((line) => line.plannedAmountUzs ?? '0'),
    );
    const branchExpenseActualUzs = monthlyExpenseActualUzs(periodId, single);
    const branchRevenuePlanUzs = monthlyRevenuePlanUzs(periodId, single);
    const branchRevenueActualUzs = monthlyRevenueActualUzs(periodId, single);
    return {
      branchId: branch.id,
      name: branch.name,
      expensePlanUzs: branchExpensePlanUzs,
      expenseActualUzs: branchExpenseActualUzs,
      expenseCompletionPct: percentageValue(branchExpenseActualUzs, branchExpensePlanUzs),
      revenuePlanUzs: branchRevenuePlanUzs,
      revenueActualUzs: branchRevenueActualUzs,
      revenueCompletionPct: percentageValue(branchRevenueActualUzs, branchRevenuePlanUzs),
    };
  });
  return {
    isDemo: true,
    period,
    branchId,
    granularity,
    expensePlanUzs,
    expenseActualUzs,
    expenseVarianceUzs: (BigInt(expensePlanUzs) - BigInt(expenseActualUzs)).toString(),
    expenseCompletionPct: percentageValue(expenseActualUzs, expensePlanUzs),
    fixedExpenseUzs,
    variableExpenseUzs,
    expenseTrend: trends.expense,
    revenuePlanUzs,
    revenueActualUzs,
    revenueVarianceUzs: (BigInt(revenueActualUzs) - BigInt(revenuePlanUzs)).toString(),
    revenueCompletionPct: percentageValue(revenueActualUzs, revenuePlanUzs),
    revenueTrend: trends.revenue,
    annual: buildAnnualSummary(period.year, selectedBranchIds),
    annualRevenue: buildAnnualRevenue(period.year, selectedBranchIds),
    revenueGrowth: buildRevenueGrowth(period.year, period.month, selectedBranchIds),
    ...(canViewNetProfit
      ? { annualNetProfit: buildAnnualNetProfit(period.year, selectedBranchIds) }
      : {}),
    branches: branchMetrics,
  };
}

export function filterExpenses(request: Request, user: AuthenticatedUser): Expense[] {
  const url = new URL(request.url);
  const branch = url.searchParams.get('branch');
  const categoryId = url.searchParams.get('categoryId');
  const expenseType = url.searchParams.get('expenseType');
  const departmentId = url.searchParams.get('departmentId');
  const paymentMethodId = url.searchParams.get('paymentMethodId');
  const responsibleUserId = url.searchParams.get('responsibleUserId');
  const enteredByUserId = url.searchParams.get('enteredByUserId');
  const year = url.searchParams.get('year');
  const month = url.searchParams.get('month');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const sort = url.searchParams.get('sort') ?? 'transactionDate:desc';
  const filtered = db.expenseRows
    .filter(
      (item) =>
        hasPermission(user, 'expense.view_all_branches') || canUseBranch(user, item.branchId),
    )
    .filter((item) => !branch || branch === 'all' || item.branchId === branch)
    .filter((item) => !categoryId || categoryId === 'all' || item.categoryId === categoryId)
    .filter(
      (item) => !expenseType || expenseType === 'all' || item.expenseTypeSnapshot === expenseType,
    )
    .filter((item) => !departmentId || departmentId === 'all' || item.departmentId === departmentId)
    .filter(
      (item) =>
        !paymentMethodId || paymentMethodId === 'all' || item.paymentMethodId === paymentMethodId,
    )
    .filter(
      (item) =>
        !responsibleUserId ||
        responsibleUserId === 'all' ||
        item.responsibleUserId === responsibleUserId,
    )
    .filter(
      (item) => !enteredByUserId || enteredByUserId === 'all' || item.enteredBy === enteredByUserId,
    )
    .filter((item) => !year || item.transactionDate.slice(0, 4) === year)
    .filter((item) => !month || item.transactionDate.slice(5, 7) === month.padStart(2, '0'))
    .filter((item) => !dateFrom || item.transactionDate >= dateFrom)
    .filter((item) => !dateTo || item.transactionDate <= dateTo);
  const direction = sort.endsWith(':asc') ? 1 : -1;
  return filtered.sort(
    (a, b) =>
      direction *
      (a.transactionDate.localeCompare(b.transactionDate) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id)),
  );
}

export function buildExpenseAnalytics(
  user: AuthenticatedUser,
  periodId: string,
  from: string,
  to: string,
  requestedBranch: string,
): ExpenseAnalytics {
  const scopedBranches = branches.filter(
    (branch) =>
      branch.isActive &&
      canUseBranch(user, branch.id) &&
      (requestedBranch === 'all' || branch.id === requestedBranch),
  );
  const branchIds = new Set(scopedBranches.map((branch) => branch.id));
  const filtered = db.expenseRows.filter(
    (expense) =>
      branchIds.has(expense.branchId) &&
      expense.transactionDate >= from &&
      expense.transactionDate <= to,
  );
  const totalAmountUzs = sumMoney(filtered.map((expense) => expense.amountUzs));
  const period = periodRows.find((item) => item.id === periodId)!;
  const planLines = buildBudgetPlan(periodId).lines.filter(
    (line) => branchIds.has(line.branchId) && line.hasPlan,
  );
  const plannedAmountUzs = sumMoney(planLines.map((line) => line.plannedAmountUzs ?? '0'));
  const breakdown = (rows: Expense[]) => {
    const amountUzs = sumMoney(rows.map((expense) => expense.amountUzs));
    return {
      amountUzs,
      transactionCount: rows.length,
      sharePct: percentageValue(amountUzs, totalAmountUzs),
    };
  };
  const paymentBreakdowns = (rows: Expense[]) =>
    db.paymentMethodRows
      .filter(
        (method) =>
          method.isActive || rows.some((expense) => expense.paymentMethodId === method.id),
      )
      .map((method) => ({
        id: method.id,
        code: method.code,
        name: method.name,
        ...breakdown(rows.filter((expense) => expense.paymentMethodId === method.id)),
      }));
  const categoryGroups = new Map<string, Expense[]>();
  for (const expense of filtered) {
    const key = `${expense.categoryId}:${expense.expenseTypeSnapshot}`;
    categoryGroups.set(key, [...(categoryGroups.get(key) ?? []), expense]);
  }

  return {
    filters: { from, to, branch: requestedBranch },
    hasData: filtered.length > 0,
    planComparison: {
      periodId,
      periodLabel: period.label,
      hasPlan: planLines.length > 0,
      plannedAmountUzs,
      actualAmountUzs: totalAmountUzs,
      varianceUzs: (BigInt(plannedAmountUzs) - BigInt(totalAmountUzs)).toString(),
      completionPct: percentageValue(totalAmountUzs, plannedAmountUzs),
    },
    summary: {
      totalAmountUzs,
      transactionCount: filtered.length,
      fixed: breakdown(filtered.filter((expense) => expense.expenseTypeSnapshot === 'fixed')),
      variable: breakdown(filtered.filter((expense) => expense.expenseTypeSnapshot === 'variable')),
    },
    paymentMethods: paymentBreakdowns(filtered),
    branches: scopedBranches.map((branch) => {
      const rows = filtered.filter((expense) => expense.branchId === branch.id);
      return {
        branchId: branch.id,
        branchName: branch.name,
        totalAmountUzs: sumMoney(rows.map((expense) => expense.amountUzs)),
        transactionCount: rows.length,
        fixedAmountUzs: sumMoney(
          rows
            .filter((expense) => expense.expenseTypeSnapshot === 'fixed')
            .map((expense) => expense.amountUzs),
        ),
        variableAmountUzs: sumMoney(
          rows
            .filter((expense) => expense.expenseTypeSnapshot === 'variable')
            .map((expense) => expense.amountUzs),
        ),
        paymentMethods: paymentBreakdowns(rows),
      };
    }),
    categories: [...categoryGroups.values()]
      .map((rows) => {
        const first = rows[0]!;
        return {
          categoryId: first.categoryId,
          categoryCodeSnapshot: first.categoryCodeSnapshot,
          categoryNameSnapshot: first.categoryNameSnapshot,
          expenseTypeSnapshot: first.expenseTypeSnapshot,
          ...breakdown(rows),
        };
      })
      .sort((left, right) => {
        const leftAmount = BigInt(left.amountUzs);
        const rightAmount = BigInt(right.amountUzs);
        return leftAmount === rightAmount ? 0 : leftAmount > rightAmount ? -1 : 1;
      })
      .slice(0, 8),
    recentExpenses: [...filtered]
      .sort(
        (left, right) =>
          right.transactionDate.localeCompare(left.transactionDate) ||
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id),
      )
      .slice(0, 10)
      .map((expense) => ({
        id: expense.id,
        transactionDate: expense.transactionDate,
        description: expense.description,
        categoryNameSnapshot: expense.categoryNameSnapshot,
        branchName: expense.branchName,
        amountUzs: expense.amountUzs,
        expenseTypeSnapshot: expense.expenseTypeSnapshot,
        paymentMethodName: expense.paymentMethodName,
      })),
  };
}
