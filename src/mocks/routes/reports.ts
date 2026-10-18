import { http, HttpResponse } from 'msw';
import { branches, ids } from '../fixtures';
import { buildCashierReport } from '@/features/reports/cashier-report';
import { API, db, periodRows } from '../state';
import { canUseBranch, hasPermission, ok, problem, requireUser } from '../support/http';
import { monthlyRevenueActualUzs, revenuePlanFor } from '../data/revenue';
import { percentageValue, planActual, sumMoney } from '../support/money';
import { buildBudgetPlan } from '../data/budget';

export const reportHandlers = [
  http.get(`${API}/reports/cashiers`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    const seesEveryone = hasPermission(user, 'reports.view_cashiers');
    if (!seesEveryone && !hasPermission(user, 'reports.view_own_performance'))
      return problem(403, 'PERMISSION_DENIED', 'Kassirlar hisobotini ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const periodId = url.searchParams.get('period') ?? ids.periodAug;
    const period = periodRows.find((row) => row.id === periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    const requested = url.searchParams.get('branch') || 'all';
    if (requested !== 'all' && !canUseBranch(user, requested))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    const branchFilter =
      requested === 'all' && user.branchScopes.length === 1
        ? (user.branchScopes[0] ?? 'all')
        : requested;
    return ok(
      buildCashierReport({
        periodId,
        periodLabel: period.label,
        branchFilter,
        branches,
        users: db.userRows,
        revenues: db.revenueRows,
        branchPlanUzs: Object.fromEntries(
          branches.map((branch) => [branch.id, revenuePlanFor(periodId, branch.id) ?? '0']),
        ),
        // Ruxsati cheklangan kassir faqat o‘z qatorini oladi.
        ...(seesEveryone ? {} : { viewerId: user.id }),
      }),
    );
  }),
  http.get(`${API}/reports/monthly`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'reports.view'))
      return problem(403, 'PERMISSION_DENIED', 'Oylik hisobotni ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const requestedBranch = url.searchParams.get('branch') || 'all';
    if (requestedBranch !== 'all' && !canUseBranch(user, requestedBranch))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial hisobotini ko‘rish huquqi yo‘q.');
    const branchFilter =
      requestedBranch === 'all' && user.branchScopes.length === 1
        ? user.branchScopes[0]!
        : requestedBranch;
    const requestedYear = Number(url.searchParams.get('year') || 2026);
    if (requestedYear !== 2026) {
      const noData = planActual(null, '0', false);
      return ok({
        year: requestedYear,
        branchFilter,
        averagePolicy: {
          code: 'elapsed_months' as const,
          label: 'Tanlangan yilda yopilgan oy mavjud emas',
          denominator: 0,
        },
        rows: [],
        totals: { fixed: noData, variable: noData, overall: noData },
      });
    }
    const historicalCategoryMap = new Map<
      string,
      { id: string; code: string; name: string; expenseType: 'fixed' | 'variable' }
    >();
    db.budgetPlanRows.forEach((plan) => {
      plan.lines.forEach((line) => {
        if (!historicalCategoryMap.has(line.categoryId))
          historicalCategoryMap.set(line.categoryId, {
            id: line.categoryId,
            code: line.categoryCodeSnapshot,
            name: line.categoryNameSnapshot,
            expenseType: line.expenseTypeSnapshot,
          });
      });
    });
    db.expenseRows.forEach((expense) => {
      if (!historicalCategoryMap.has(expense.categoryId))
        historicalCategoryMap.set(expense.categoryId, {
          id: expense.categoryId,
          code: expense.categoryCodeSnapshot,
          name: expense.categoryNameSnapshot,
          expenseType: expense.expenseTypeSnapshot,
        });
    });
    db.categoryRows.forEach((category) => {
      if (!historicalCategoryMap.has(category.id))
        historicalCategoryMap.set(category.id, {
          id: category.id,
          code: category.code,
          name: category.name,
          expenseType: category.expenseType,
        });
    });
    const reportCategories = [...historicalCategoryMap.values()];
    const selectedBranchIds = new Set(branchFilter === 'all' ? user.branchScopes : [branchFilter]);
    const rows = reportCategories.map((category) => {
      const months = Array.from({ length: 12 }, (_, monthIndex) => {
        const period = periodRows.find(
          (candidate) => candidate.year === requestedYear && candidate.month === monthIndex + 1,
        );
        const planLines = period
          ? buildBudgetPlan(period.id).lines.filter(
              (line) =>
                line.categoryId === category.id &&
                selectedBranchIds.has(line.branchId) &&
                line.plannedAmountUzs !== null,
            )
          : [];
        const planned = planLines.length
          ? sumMoney(planLines.map((line) => line.plannedAmountUzs ?? '0'))
          : null;
        const actualRows = period
          ? db.expenseRows.filter(
              (expense) =>
                expense.periodId === period.id &&
                selectedBranchIds.has(expense.branchId) &&
                expense.categoryId === category.id,
            )
          : [];
        const actual = sumMoney(actualRows.map((expense) => expense.amountUzs));
        return {
          month: monthIndex + 1,
          planActual: planActual(planned, actual, planLines.length > 0),
          transactionCount: actualRows.length,
        };
      });
      const plannedMonths = months.flatMap((item) =>
        item.planActual.plannedAmountUzs === null ? [] : [item.planActual.plannedAmountUzs],
      );
      const plannedTotal = plannedMonths.length ? sumMoney(plannedMonths) : null;
      const actualTotal = sumMoney(months.map((item) => item.planActual.actualAmountUzs));
      return {
        category: {
          id: category.id,
          code: category.code,
          name: category.name,
          snapshotName: category.name,
          expenseTypeSnapshot: category.expenseType,
        },
        months,
        annual: {
          ...planActual(plannedTotal, actualTotal, plannedMonths.length > 0),
          transactionCount: months.reduce((total, item) => total + item.transactionCount, 0),
        },
      };
    });
    const aggregateRows = (type?: 'fixed' | 'variable') => {
      const selected = type
        ? rows.filter((row) => row.category.expenseTypeSnapshot === type)
        : rows;
      const plannedValues = selected.flatMap((row) =>
        row.annual.plannedAmountUzs === null ? [] : [row.annual.plannedAmountUzs],
      );
      return planActual(
        plannedValues.length ? sumMoney(plannedValues) : null,
        sumMoney(selected.map((row) => row.annual.actualAmountUzs)),
        plannedValues.length > 0,
      );
    };
    const monthsWithActual = new Set(
      rows.flatMap((row) =>
        row.months.filter((month) => month.transactionCount > 0).map((month) => month.month),
      ),
    ).size;
    const canViewNetProfit = user.roles.some((assignment) =>
      ['director', 'business_owner', 'finance_manager'].includes(assignment.role),
    );
    const financialMonths = canViewNetProfit
      ? Array.from({ length: 12 }, (_, monthIndex) => {
          const month = monthIndex + 1;
          const period = periodRows.find(
            (candidate) => candidate.year === requestedYear && candidate.month === month,
          );
          const revenuePlans = period
            ? [...selectedBranchIds].flatMap((branchId) => {
                const value = revenuePlanFor(period.id, branchId);
                return value === null ? [] : [value];
              })
            : [];
          const revenuePlanUzs = revenuePlans.length ? sumMoney(revenuePlans) : null;
          const revenueActualUzs = period
            ? monthlyRevenueActualUzs(period.id, selectedBranchIds)
            : '0';
          const expenseActualUzs = sumMoney(
            rows.map((row) => row.months[monthIndex]!.planActual.actualAmountUzs),
          );
          const netProfitUzs = (BigInt(revenueActualUzs) - BigInt(expenseActualUzs)).toString();
          return {
            month,
            revenuePlanUzs,
            revenueActualUzs,
            expenseActualUzs,
            netProfitUzs,
            revenueCompletionPercent:
              revenuePlanUzs === null ? null : percentageValue(revenueActualUzs, revenuePlanUzs),
            netMarginPercent:
              revenueActualUzs === '0' ? null : percentageValue(netProfitUzs, revenueActualUzs),
          };
        })
      : undefined;
    return ok({
      year: requestedYear,
      branchFilter,
      averagePolicy: {
        code: 'months_with_actual',
        label: 'Fakt mavjud oylar bo‘yicha o‘rtacha',
        denominator: monthsWithActual,
      },
      rows,
      totals: {
        fixed: aggregateRows('fixed'),
        variable: aggregateRows('variable'),
        overall: aggregateRows(),
      },
      ...(financialMonths ? { financialMonths } : {}),
    });
  }),
  http.get(`${API}/reports/branch-comparison`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'reports.view'))
      return problem(403, 'PERMISSION_DENIED', 'Filiallar hisobotini ko‘rish huquqi yo‘q.');
    const branchSummary = (
      branchId: string,
      plannedExpense: string | null,
      actualExpense: string,
    ) => {
      const branch = branches.find((item) => item.id === branchId)!;
      return {
        branch: { id: branch.id, code: branch.code, name: branch.name, snapshotName: branch.name },
        expense: planActual(plannedExpense, actualExpense),
      };
    };
    const totalSummary = (plannedExpense: string | null, actualExpense: string) => ({
      branch: { id: 'all', code: 'ALL', name: 'Markaz jami', snapshotName: 'Markaz jami' },
      expense: planActual(plannedExpense, actualExpense),
    });
    const url = new URL(request.url);
    const requestedYear = Number(url.searchParams.get('year') || 2026);
    const requestedMonth = Number(url.searchParams.get('month') || 8);
    const requestedBranch = url.searchParams.get('branch') || 'all';
    const isVisibleBranch = (branchId: string) =>
      canUseBranch(user, branchId) && (requestedBranch === 'all' || requestedBranch === branchId);
    const monthLabels = [
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
    if (requestedYear !== 2026)
      return ok({
        year: requestedYear,
        selectedMonth: {
          month: requestedMonth,
          label: monthLabels[requestedMonth - 1] ?? String(requestedMonth),
          rows: [],
          branches: [],
          total: totalSummary('0', '0'),
        },
        months: [],
        annual: { branches: [], total: totalSummary('0', '0') },
      });
    const visibleBranches = branches.filter((branch) => isVisibleBranch(branch.id));
    const categoryIds = new Set([
      ...db.categoryRows.map((category) => category.id),
      ...db.budgetPlanRows.flatMap((plan) => plan.lines.map((line) => line.categoryId)),
      ...db.expenseRows.map((expense) => expense.categoryId),
    ]);
    const reportCategories = [...categoryIds].map((id) => {
      const category = db.categoryRows.find((row) => row.id === id);
      const line = db.budgetPlanRows
        .flatMap((plan) => plan.lines)
        .find((row) => row.categoryId === id);
      const expense = db.expenseRows.find((row) => row.categoryId === id);
      if (!category && !line && !expense) throw new Error('Kategoriya manbasi topilmadi.');
      return {
        id,
        code: category?.code ?? line?.categoryCodeSnapshot ?? expense!.categoryCodeSnapshot,
        name: category?.name ?? line?.categoryNameSnapshot ?? expense!.categoryNameSnapshot,
        expenseTypeSnapshot:
          category?.expenseType ?? line?.expenseTypeSnapshot ?? expense!.expenseTypeSnapshot,
      };
    });
    const monthData = Array.from({ length: 12 }, (_, index) => {
      const period = periodRows.find(
        (candidate) => candidate.year === requestedYear && candidate.month === index + 1,
      );
      const planLines = period ? buildBudgetPlan(period.id).lines : [];
      const actualRows = period ? db.expenseRows.filter((row) => row.periodId === period.id) : [];
      const monthBranches = visibleBranches.map((branch) => {
        const matchingPlan = planLines.filter(
          (line) => line.branchId === branch.id && line.plannedAmountUzs !== null,
        );
        return branchSummary(
          branch.id,
          matchingPlan.length
            ? sumMoney(matchingPlan.map((line) => line.plannedAmountUzs ?? '0'))
            : null,
          sumMoney(
            actualRows.filter((row) => row.branchId === branch.id).map((row) => row.amountUzs),
          ),
        );
      });
      const plans = monthBranches.flatMap((item) =>
        item.expense.plannedAmountUzs === null ? [] : [item.expense.plannedAmountUzs],
      );
      return {
        month: index + 1,
        period,
        planLines,
        actualRows,
        branches: monthBranches,
        total: totalSummary(
          plans.length ? sumMoney(plans) : null,
          sumMoney(monthBranches.map((item) => item.expense.actualAmountUzs)),
        ),
      };
    });
    const months = monthData.map(({ month, branches: monthBranches, total }) => ({
      month,
      branches: monthBranches,
      total,
    }));
    const annualBranches = visibleBranches.map((branch) => {
      const items = monthData.flatMap((item) =>
        item.branches.filter((row) => row.branch.id === branch.id),
      );
      const plans = items.flatMap((item) =>
        item.expense.plannedAmountUzs === null ? [] : [item.expense.plannedAmountUzs],
      );
      return branchSummary(
        branch.id,
        plans.length ? sumMoney(plans) : null,
        sumMoney(items.map((item) => item.expense.actualAmountUzs)),
      );
    });
    const annualPlans = annualBranches.flatMap((item) =>
      item.expense.plannedAmountUzs === null ? [] : [item.expense.plannedAmountUzs],
    );
    const annualExpensePlan = annualPlans.length ? sumMoney(annualPlans) : null;
    const annualExpenseActual = sumMoney(
      annualBranches.map((item) => item.expense.actualAmountUzs),
    );
    const selectedSummary = months[requestedMonth - 1];
    const selectedData = monthData[requestedMonth - 1];
    const selectedRows = reportCategories.map((category) => {
      const categoryBranches = visibleBranches.map((branch) => {
        const lines = (selectedData?.planLines ?? []).filter(
          (line) =>
            line.categoryId === category.id &&
            line.branchId === branch.id &&
            line.plannedAmountUzs !== null,
        );
        const actual = (selectedData?.actualRows ?? []).filter(
          (row) => row.categoryId === category.id && row.branchId === branch.id,
        );
        return {
          branch: {
            id: branch.id,
            code: branch.code,
            name: branch.name,
            snapshotName: branch.name,
          },
          expense: planActual(
            lines.length ? sumMoney(lines.map((line) => line.plannedAmountUzs ?? '0')) : null,
            sumMoney(actual.map((row) => row.amountUzs)),
          ),
        };
      });
      const plans = categoryBranches.flatMap((item) =>
        item.expense.plannedAmountUzs === null ? [] : [item.expense.plannedAmountUzs],
      );
      return {
        category: {
          id: category.id,
          code: category.code,
          name: category.name,
          snapshotName: category.name,
          expenseTypeSnapshot: category.expenseTypeSnapshot,
        },
        branches: categoryBranches,
        total: totalSummary(
          plans.length ? sumMoney(plans) : null,
          sumMoney(categoryBranches.map((item) => item.expense.actualAmountUzs)),
        ),
      };
    });
    return ok({
      year: requestedYear,
      selectedMonth: {
        month: requestedMonth,
        label: monthLabels[requestedMonth - 1] ?? String(requestedMonth),
        rows: selectedRows,
        branches: selectedSummary?.branches ?? [],
        total: selectedSummary?.total ?? totalSummary('0', '0'),
      },
      months,
      annual: {
        branches: annualBranches,
        total: totalSummary(annualExpensePlan, annualExpenseActual),
      },
    });
  }),
];
