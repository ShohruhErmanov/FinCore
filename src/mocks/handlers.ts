import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import type {
  AuditEvent,
  AuthenticatedUser,
  BudgetRevisionCreateInput,
  BudgetVersion,
  Expense,
  ExpenseCreateInput,
  ImportJob,
  MoneyUzs,
  PaginatedResponse,
  PeriodCloseReadiness,
  PeriodCloseSnapshot,
  RevenueCreateInput,
  RevenuePlan,
  RevenuePlanSummary,
  RevenueTransaction,
  UserDirectoryItem,
  UserAccessUpdateInput,
} from '@/shared/types/domain';
import {
  auditEvents,
  branches,
  budgetHistoricalVersion,
  budgetVersion,
  categories,
  closeReadiness,
  dashboard,
  departments,
  dqExceptions,
  expenses,
  ids,
  paymentMethods,
  periods,
  reconciliations,
  revenuePlans,
  revenueTransactions,
  users,
} from './fixtures';

const API = '*/api';
const LATENCY_MS = 180;
const MOCK_SESSION_KEY = 'fincore.mock.user';

function storedMockUser(): AuthenticatedUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = window.sessionStorage.getItem(MOCK_SESSION_KEY);
    return id ? structuredClone(users.find((user) => user.id === id) ?? null) : null;
  } catch {
    return null;
  }
}

let signedInUser: AuthenticatedUser | null = storedMockUser();
let expenseRows = structuredClone(expenses);
let revenueRows = structuredClone(revenueTransactions);
let periodRows = structuredClone(periods);
let budgetRows: BudgetVersion[] = [
  structuredClone(budgetHistoricalVersion),
  structuredClone(budgetVersion),
];
let revenuePlanRows = structuredClone(revenuePlans);
let periodHistoryRows = new Map<string, PeriodCloseReadiness['history']>([
  [ids.periodJul, structuredClone(closeReadiness.history)],
  [ids.periodAug, []],
]);
let periodSnapshotRows = new Map<string, PeriodCloseSnapshot>([
  [
    ids.periodJul,
    {
      id: 'snapshot-2026-07',
      createdAt: periods[1]?.closedAt ?? '2026-08-03T09:12:00+05:00',
      createdByName: periods[1]?.closedByName ?? 'Shohrux Ermanov',
      expenseActualUzs: '0',
      revenueActualUzs: '0',
      netResultUzs: '0',
      reconciliationStatus: 'match',
      artifacts: ['Dashboard', 'Xarajatlar', 'Tushumlar', 'Reconciliation'],
    },
  ],
]);
let categoryRows = structuredClone(categories);
let departmentRows = structuredClone(departments);
let paymentMethodRows = structuredClone(paymentMethods);
let userRows = structuredClone(users);
let dqRows = structuredClone(dqExceptions);
let auditRows = structuredClone(auditEvents);
let rolePermissionRows: Record<
  AuthenticatedUser['roles'][number]['role'],
  AuthenticatedUser['permissions']
> = {
  cashier: structuredClone(users[2]!.permissions),
  finance_manager: structuredClone(users[1]!.permissions),
  director: structuredClone(users[0]!.permissions),
};
let reconciliationRows = structuredClone(reconciliations);
let importJob: ImportJob = {
  id: 'import-xalqlar-date-normalization',
  sourceName: 'Xalqlar_kassa',
  status: 'preview_ready',
  totalRows: 44,
  normalizedRows: 0,
  exceptionRows: 43,
  recoveredAmountUzs: '0',
  startedAt: null,
  completedAt: null,
  message: '43 ta text-date satri previewda aniqlandi; hech biri jim tashlab ketilmaydi.',
};
interface LegacyImportedLedgerRow {
  sourceRow: number;
  amountUzs: MoneyUzs;
}
let legacyImportedLedgerRows: LegacyImportedLedgerRow[] = [];
const expenseIdempotency = new Map<string, Expense>();
const revenueIdempotency = new Map<string, RevenueTransaction>();

const ok = <T extends JsonBodyType>(body: T, status = 200) => HttpResponse.json(body, { status });
const noContent = () => new HttpResponse(null, { status: 204 });
const problem = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => HttpResponse.json({ code, message, ...(details ? { details } : {}) }, { status });

function requireUser(): AuthenticatedUser | HttpResponse {
  if (!signedInUser) return problem(401, 'UNAUTHENTICATED', 'Sessiya tugagan. Qayta kiring.');
  const current = userRows.find((user) => user.id === signedInUser?.id);
  if (!current || current.status !== 'active') {
    signedInUser = null;
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(MOCK_SESSION_KEY);
    return problem(401, 'ACCOUNT_DISABLED', 'Hisob nofaol yoki bloklangan.');
  }
  return signedInUser;
}

function hasPermission(
  user: AuthenticatedUser,
  permission: AuthenticatedUser['permissions'][number],
): boolean {
  return user.permissions.includes(permission);
}

function hasAnyPermission(
  user: AuthenticatedUser,
  ...permissions: AuthenticatedUser['permissions']
): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

function hasRole(
  user: AuthenticatedUser,
  role: AuthenticatedUser['roles'][number]['role'],
): boolean {
  return user.roles.some((assignment) => assignment.role === role);
}

function canUseBranch(user: AuthenticatedUser, branchId: string): boolean {
  return user.branchScopes.includes(branchId);
}

function canWriteBranch(user: AuthenticatedUser, branchId: string): boolean {
  return user.writeBranchScopes.includes(branchId);
}

function percentageValue(actual: MoneyUzs, denominator: MoneyUzs): number | null {
  const divisor = BigInt(denominator);
  if (divisor === 0n) return null;
  const numerator = BigInt(actual) * 10_000n;
  const negative = numerator < 0n !== divisor < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDivisor = divisor < 0n ? -divisor : divisor;
  const rounded = (absoluteNumerator + absoluteDivisor / 2n) / absoluteDivisor;
  return Number(negative ? -rounded : rounded) / 100;
}

function isPositiveMoney(value: unknown): value is MoneyUzs {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function isNonNegativeMoney(value: unknown): value is MoneyUzs {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function findPeriodForBusinessDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== Number(match[3])
  )
    return null;
  return periodRows.find((period) => period.year === year && period.month === month) ?? null;
}

function scopedBranchFilter(user: AuthenticatedUser, requested: string | null): string | null {
  if (!requested || requested === 'all')
    return user.branchScopes.length === 1 ? (user.branchScopes[0] ?? null) : null;
  return requested;
}

function integer(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function paginate<T>(items: T[], request: Request): PaginatedResponse<T> {
  const url = new URL(request.url);
  const page = integer(url.searchParams.get('page'), 1);
  const pageSize = Math.min(integer(url.searchParams.get('pageSize'), 20), 100);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
    nextCursor: start + pageSize < items.length ? String(page + 1) : null,
  };
}

function localBusinessDate(paymentAt: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(paymentAt));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function sumMoney(values: MoneyUzs[]): MoneyUzs {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
}

function normalizedLegacyLedgerRows(includeCategoryException: boolean) {
  const normalizedSourceRows = Array.from({ length: 43 }, (_, index) => index + 5).filter(
    (sourceRow) => sourceRow !== 27,
  );
  const normalized: LegacyImportedLedgerRow[] = normalizedSourceRows.map((sourceRow, index) => ({
    sourceRow,
    amountUzs: index === normalizedSourceRows.length - 1 ? '1968400' : '100000',
  }));
  if (includeCategoryException) normalized.push({ sourceRow: 27, amountUzs: '250000' });
  return normalized;
}

function syncLegacyImportedExpenses(
  includeCategoryException: boolean,
  resolvedCategoryId?: string,
): void {
  const normalized = normalizedLegacyLedgerRows(includeCategoryException);
  const branch = branches.find((item) => item.id === ids.xalqlar);
  const defaultCategory = categoryRows.find((item) => item.isActive) ?? categoryRows[0];
  const resolvedCategory = resolvedCategoryId
    ? categoryRows.find((item) => item.id === resolvedCategoryId && item.isActive)
    : undefined;
  const method = paymentMethodRows.find((item) => item.id === ids.bank) ?? paymentMethodRows[0];
  const department = departmentRows.find((item) => item.isActive) ?? departmentRows[0];
  const responsible = userRows.find((item) => item.id === ids.cashierX) ?? userRows[0];
  legacyImportedLedgerRows = normalized;
  expenseRows = expenseRows.filter((row) => row.sourceSheet !== 'Xalqlar_kassa');
  if (!branch || !defaultCategory || !method || !department || !responsible) return;
  const importedRows: Expense[] = normalized.map((row, index) => {
    const category = row.sourceRow === 27 ? (resolvedCategory ?? defaultCategory) : defaultCategory;
    const day = String((index % 28) + 1).padStart(2, '0');
    const occurredAt = `2026-08-${day}T12:00:00+05:00`;
    return {
      id: `legacy-xalqlar-${row.sourceRow}`,
      transactionDate: `2026-08-${day}`,
      periodId: ids.periodAug,
      branchId: branch.id,
      branchName: branch.name,
      categoryId: category.id,
      categoryCodeSnapshot: category.code,
      categoryNameSnapshot: category.name,
      expenseTypeSnapshot: category.expenseType,
      description: `Xalqlar_kassa legacy satr ${row.sourceRow}`,
      amountUzs: row.amountUzs,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
      departmentId: department.id,
      departmentName: department.name,
      responsibleUserId: responsible.id,
      responsibleUserName: responsible.fullName,
      enteredBy: ids.finance,
      enteredByName: users.find((item) => item.id === ids.finance)?.fullName ?? 'Import xizmati',
      comment: 'Text-date normalizatsiyasi orqali import qilindi.',
      status: 'approved',
      isReversed: false,
      reversalReason: null,
      sourceSheet: 'Xalqlar_kassa',
      sourceRow: row.sourceRow,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      audit: [],
    };
  });
  expenseRows = [...importedRows, ...expenseRows];
}

function planActual(
  plannedAmountUzs: MoneyUzs | null,
  actualAmountUzs: MoneyUzs,
  hasPlan = plannedAmountUzs !== null,
) {
  const planned = plannedAmountUzs === null ? null : BigInt(plannedAmountUzs);
  const actual = BigInt(actualAmountUzs);
  const varianceUzs = planned === null ? null : (planned - actual).toString();
  const completionPercent =
    planned === null ? null : percentageValue(actualAmountUzs, plannedAmountUzs ?? '0');
  const status = !hasPlan
    ? actual > 0n
      ? 'unplanned'
      : 'no_plan'
    : planned === actual
      ? 'on_plan'
      : planned !== null && actual > planned
        ? 'over_plan'
        : 'under_plan';
  return { hasPlan, plannedAmountUzs, actualAmountUzs, varianceUzs, completionPercent, status };
}

function revenueKpi(
  expectedRevenueUzs: MoneyUzs,
  actualRevenueUzs: MoneyUzs,
  branchesWithPlan = 1,
  expectedBranchCount = 1,
) {
  const expected = BigInt(expectedRevenueUzs);
  const actual = BigInt(actualRevenueUzs);
  return {
    planComplete: branchesWithPlan === expectedBranchCount,
    branchesWithPlan,
    expectedBranchCount,
    expectedRevenueUzs,
    actualRevenueUzs,
    shortfallUzs: actual < expected ? (expected - actual).toString() : '0',
    overPlanUzs: actual > expected ? (actual - expected).toString() : '0',
    collectionPercent: percentageValue(actualRevenueUzs, expectedRevenueUzs),
  };
}

function branchDashboard(branchId: string | null, periodId: string) {
  const selectedBranches = branches.filter((branch) => !branchId || branch.id === branchId);
  const selectedBranchIds = new Set(selectedBranches.map((branch) => branch.id));
  const branchMetrics = selectedBranches.map((branch) => {
    const approvedPlans = revenuePlanRows
      .filter(
        (plan) =>
          plan.periodId === periodId &&
          plan.branchId === branch.id &&
          ['approved', 'locked'].includes(plan.status),
      )
      .sort((a, b) => b.revisionNo - a.revisionNo);
    const planUzs = approvedPlans[0]?.plannedAmountUzs ?? '0';
    const actualUzs = sumMoney(
      revenueRows
        .filter(
          (item) =>
            item.periodId === periodId && item.branchId === branch.id && item.status === 'posted',
        )
        .map((item) => item.amountUzs),
    );
    return {
      branchId: branch.id,
      name: branch.name,
      planUzs,
      actualUzs,
      collectionPct: percentageValue(actualUzs, planUzs),
    };
  });
  const revenuePlanUzs = sumMoney(branchMetrics.map((item) => item.planUzs));
  const revenueActualUzs = sumMoney(branchMetrics.map((item) => item.actualUzs));
  const selectedTransactions = revenueRows.filter(
    (item) =>
      item.periodId === periodId &&
      selectedBranchIds.has(item.branchId) &&
      item.status === 'posted',
  );
  const channelRows = paymentMethods.slice(0, 3).map((method) => {
    const amountUzs = sumMoney(
      selectedTransactions
        .filter((item) => item.paymentMethodId === method.id)
        .map((item) => item.amountUzs),
    );
    return {
      id: method.id,
      name: method.name,
      amountUzs,
      sharePct: percentageValue(amountUzs, revenueActualUzs),
    };
  });
  const expenseByType = (type: 'fixed' | 'variable') =>
    sumMoney(
      expenseRows
        .filter(
          (item) =>
            item.periodId === periodId &&
            selectedBranchIds.has(item.branchId) &&
            !item.isReversed &&
            item.expenseTypeSnapshot === type,
        )
        .map((item) => item.amountUzs),
    );
  const fixedExpenseUzs = expenseByType('fixed');
  const variableExpenseUzs = expenseByType('variable');
  const expenseActualUzs = (BigInt(fixedExpenseUzs) + BigInt(variableExpenseUzs)).toString();
  const effectiveBudget = latestApprovedBudget(periodId);
  const expensePlanUzs = effectiveBudget
    ? sumMoney(
        effectiveBudget.lines
          .filter(
            (line) => selectedBranchIds.has(line.branchId) && line.plannedAmountUzs !== null,
          )
          .map((line) => line.plannedAmountUzs ?? '0'),
      )
    : '0';
  const netResultUzs = (BigInt(revenueActualUzs) - BigInt(expenseActualUzs)).toString();
  return {
    ...dashboard,
    period: periodRows.find((period) => period.id === periodId) ?? dashboard.period,
    branchId,
    expensePlanUzs,
    expenseActualUzs,
    expenseVarianceUzs: (BigInt(expensePlanUzs) - BigInt(expenseActualUzs)).toString(),
    expenseCompletionPct: percentageValue(expenseActualUzs, expensePlanUzs),
    revenuePlanUzs,
    revenueActualUzs,
    revenueGapUzs:
      BigInt(revenueActualUzs) < BigInt(revenuePlanUzs)
        ? (BigInt(revenuePlanUzs) - BigInt(revenueActualUzs)).toString()
        : '0',
    revenueOverPlanUzs:
      BigInt(revenueActualUzs) > BigInt(revenuePlanUzs)
        ? (BigInt(revenueActualUzs) - BigInt(revenuePlanUzs)).toString()
        : '0',
    collectionPct: percentageValue(revenueActualUzs, revenuePlanUzs),
    netResultUzs,
    netMarginPct: percentageValue(netResultUzs, revenueActualUzs),
    fixedExpenseUzs,
    variableExpenseUzs,
    channels: channelRows,
    branches: branchMetrics,
  };
}

function filterExpenses(request: Request, user: AuthenticatedUser): Expense[] {
  const url = new URL(request.url);
  const branch = url.searchParams.get('branch');
  const status = url.searchParams.get('status');
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
  const filtered = expenseRows
    .filter(
      (item) =>
        hasPermission(user, 'expense.view_all_branches') || canUseBranch(user, item.branchId),
    )
    .filter((item) => !branch || branch === 'all' || item.branchId === branch)
    .filter((item) => !status || status === 'all' || item.status === status)
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

function filterRevenue(request: Request, user: AuthenticatedUser): RevenueTransaction[] {
  const url = new URL(request.url);
  const branch = url.searchParams.get('branch');
  const method = url.searchParams.get('paymentMethod');
  const collector = url.searchParams.get('collector');
  const status = url.searchParams.get('status');
  const periodId = url.searchParams.get('periodId');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const search = url.searchParams.get('search')?.toLocaleLowerCase('uz') ?? '';
  return revenueRows
    .filter((item) => hasPermission(user, 'revenue.view_all') || canUseBranch(user, item.branchId))
    .filter((item) => !branch || branch === 'all' || item.branchId === branch)
    .filter((item) => !method || method === 'all' || item.paymentMethodId === method)
    .filter((item) => !collector || collector === 'all' || item.collectorUserId === collector)
    .filter((item) => !status || status === 'all' || item.status === status)
    .filter((item) => !periodId || item.periodId === periodId)
    .filter((item) => !dateFrom || item.paymentBusinessDate >= dateFrom)
    .filter((item) => !dateTo || item.paymentBusinessDate <= dateTo)
    .filter(
      (item) =>
        !search ||
        `${item.receiptNo} ${item.description} ${item.collectorName}`
          .toLocaleLowerCase('uz')
          .includes(search),
    )
    .sort(
      (a, b) =>
        b.paymentAt.localeCompare(a.paymentAt) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    );
}

function latestApprovedBudget(periodId: string): BudgetVersion | undefined {
  return budgetRows
    .filter(
      (version) =>
        version.periodId === periodId && ['approved', 'locked'].includes(version.status),
    )
    .sort((a, b) => b.revisionNo - a.revisionNo)[0];
}

function latestApprovedRevenuePlan(periodId: string, branchId: string) {
  return revenuePlanRows
    .filter(
      (plan) =>
        plan.periodId === periodId &&
        plan.branchId === branchId &&
        ['approved', 'locked'].includes(plan.status),
    )
    .sort((a, b) => b.revisionNo - a.revisionNo)[0];
}

function revenueChannels(rows: RevenueTransaction[], periodId: string, branchFilter: string) {
  const total = sumMoney(rows.map((row) => row.amountUzs));
  return paymentMethodRows.slice(0, 3).map((method) => {
    const channelRows = rows.filter((row) => row.paymentMethodId === method.id);
    const amountUzs = sumMoney(channelRows.map((row) => row.amountUzs));
    return {
      id: method.id,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
      amountUzs,
      transactionCount: channelRows.length,
      sharePercent: percentageValue(amountUzs, total),
      drilldownFilters: {
        period: periodId,
        branch: branchFilter,
        paymentMethod: method.id,
        status: 'posted',
      },
    };
  });
}

function buildRevenueReport(periodId: string, branchId: string | null) {
  const selectedBranches = branches.filter((branch) => !branchId || branch.id === branchId);
  const selectedIds = new Set(selectedBranches.map((branch) => branch.id));
  const postedRows = revenueRows.filter(
    (row) => row.periodId === periodId && row.status === 'posted' && selectedIds.has(row.branchId),
  );
  const branchReports = selectedBranches.map((branch) => {
    const plan = latestApprovedRevenuePlan(periodId, branch.id);
    const branchRows = postedRows.filter((row) => row.branchId === branch.id);
    const actual = sumMoney(branchRows.map((row) => row.amountUzs));
    return {
      branchId: branch.id,
      branchName: branch.name,
      kpi: revenueKpi(plan?.plannedAmountUzs ?? '0', actual, plan ? 1 : 0, 1),
      channels: revenueChannels(branchRows, periodId, branch.id),
    };
  });
  const expectedRevenue = sumMoney(branchReports.map((item) => item.kpi.expectedRevenueUzs));
  const actualRevenue = sumMoney(branchReports.map((item) => item.kpi.actualRevenueUzs));
  const branchesWithPlan = branchReports.filter((item) => item.kpi.branchesWithPlan === 1).length;
  const branchFilter = branchId ?? 'all';
  return {
    period: periodRows.find((period) => period.id === periodId)!,
    branchFilter,
    center: revenueKpi(expectedRevenue, actualRevenue, branchesWithPlan, selectedBranches.length),
    channels: revenueChannels(postedRows, periodId, branchFilter),
    branches: branchReports,
    reconciliation: {
      id: `rec-revenue-${periodId}-${branchFilter}`,
      scope: 'Tushum: markaz = filiallar = kanallar = kassirlar',
      sourceCount: postedRows.length,
      sourceSumUzs: actualRevenue,
      targetCount: postedRows.length,
      targetSumUzs: actualRevenue,
      diffCount: 0,
      diffSumUzs: '0',
      status: 'match' as const,
      checkedAt: new Date().toISOString(),
    },
  };
}

function refreshLegacyReconciliation(): void {
  const legacy = reconciliationRows.find((row) => row.id === 'rec-legacy');
  if (legacy) {
    const targetCount = 49 + legacyImportedLedgerRows.length;
    const targetSumUzs = (
      46_115_000n + BigInt(sumMoney(legacyImportedLedgerRows.map((row) => row.amountUzs)))
    ).toString();
    const diffCount = legacy.sourceCount - targetCount;
    const diffSumUzs = (BigInt(legacy.sourceSumUzs) - BigInt(targetSumUzs)).toString();
    Object.assign(legacy, {
      targetCount,
      targetSumUzs,
      diffCount,
      diffSumUzs,
      status: diffCount === 0 && diffSumUzs === '0' ? 'match' : 'mismatch',
    });
    legacy.checkedAt = new Date().toISOString();
  }
}

function refreshOperationalState(periodId: string = ids.periodAug): PeriodCloseReadiness {
  refreshLegacyReconciliation();
  const period = periodRows.find((row) => row.id === periodId);
  if (!period) throw new Error(`Unknown mock accounting period: ${periodId}`);
  const state: PeriodCloseReadiness = {
    period: structuredClone(period),
    canClose: false,
    checks: structuredClone(closeReadiness.checks),
    history: structuredClone(periodHistoryRows.get(periodId) ?? []),
    snapshot: structuredClone(periodSnapshotRows.get(periodId) ?? null),
  };
  const legacy = reconciliationRows.find((row) => row.id === 'rec-legacy');

  const expenseCheck = state.checks.find((check) => check.id === 'expense-rec');
  if (expenseCheck) {
    const applicableLegacy = periodId === ids.periodAug ? legacy : undefined;
    expenseCheck.status = applicableLegacy?.status === 'mismatch' ? 'blocked' : 'passed';
    expenseCheck.description = applicableLegacy
      ? applicableLegacy.status === 'match'
        ? 'Legacy manba va yagona ledger count/sum bo‘yicha teng.'
        : `Manba va ledger orasida ${applicableLegacy.diffSumUzs} so‘m tafovut bor.`
      : 'Bu davr uchun ochiq expense reconciliation tafovuti yo‘q.';
    expenseCheck.count = applicableLegacy ? Math.abs(applicableLegacy.diffCount) : 0;
    expenseCheck.amountUzs = applicableLegacy?.diffSumUzs ?? '0';
  }

  const applicableDqRows = periodId === ids.periodAug ? dqRows : [];
  const openErrors = applicableDqRows.filter(
    (row) => row.status === 'open' && row.severity === 'error',
  );
  const openWarnings = applicableDqRows.filter(
    (row) => row.status === 'open' && row.severity === 'warning',
  );
  const dqCheck = state.checks.find((check) => check.id === 'dq');
  if (dqCheck) {
    dqCheck.status = openErrors.length ? 'blocked' : openWarnings.length ? 'warning' : 'passed';
    dqCheck.count = openErrors.length + openWarnings.length;
    dqCheck.amountUzs = sumMoney([...openErrors, ...openWarnings].map((row) => row.amountUzs));
    dqCheck.description = openErrors.length
      ? `${openErrors.length} ta kritik exception ochiq.`
      : openWarnings.length
        ? `${openWarnings.length} ta warning direktor ko‘rib chiqishini talab qiladi.`
        : 'Ochiq data-quality exception qolmagan.';
  }

  const plansCheck = state.checks.find((check) => check.id === 'plans');
  if (plansCheck) {
    const budgetInProgress = budgetRows.some(
      (budget) =>
        budget.periodId === periodId &&
        (budget.status === 'draft' || budget.status === 'submitted'),
    );
    const budgetReady = budgetRows.some(
      (budget) =>
        budget.periodId === periodId && ['approved', 'locked'].includes(budget.status),
    );
    const revenueInProgress = revenuePlanRows.some(
      (plan) =>
        plan.periodId === periodId && (plan.status === 'draft' || plan.status === 'submitted'),
    );
    const plannedBranches = new Set(
      revenuePlanRows
        .filter(
          (plan) => plan.periodId === periodId && ['approved', 'locked'].includes(plan.status),
        )
        .map((plan) => plan.branchId),
    );
    const revenueReady = branches
      .filter((branch) => branch.isActive)
      .every((branch) => plannedBranches.has(branch.id));
    const ready = budgetReady && revenueReady && !budgetInProgress && !revenueInProgress;
    plansCheck.status = ready ? 'passed' : 'blocked';
    plansCheck.description = ready
      ? 'Budjet va ikki filial tushum rejalari tasdiqlangan.'
      : budgetInProgress || revenueInProgress
        ? 'Draft/submitted reja oqimi ochiq; yopishdan oldin tasdiqlang yoki bekor qiling.'
        : 'Tasdiqlangan budjet va har ikki filial tushum rejasi majburiy.';
  }

  const revenueCheck = state.checks.find((check) => check.id === 'revenue-rec');
  if (revenueCheck) {
    const report = buildRevenueReport(periodId, null);
    revenueCheck.status = report.reconciliation.status === 'match' ? 'passed' : 'blocked';
    revenueCheck.description =
      report.reconciliation.status === 'match'
        ? 'Filial, kanal va kassir summalari teng.'
        : 'Tushum kesimlari reconciliationida tafovut bor.';
    revenueCheck.count = Math.abs(report.reconciliation.diffCount);
    revenueCheck.amountUzs = report.reconciliation.diffSumUzs;
  }

  const unplannedCheck = state.checks.find((check) => check.id === 'unplanned');
  if (unplannedCheck && periodId !== ids.periodAug) {
    unplannedCheck.status = 'passed';
    unplannedCheck.count = 0;
    unplannedCheck.amountUzs = '0';
    unplannedCheck.description = 'Bu davrda budjetsiz xarajat aniqlanmadi.';
  }

  if (period.status === 'closed' && state.snapshot) {
    state.checks = state.checks.map((check) => ({
      ...check,
      status: check.status === 'warning' ? 'warning' : 'passed',
      description:
        check.status === 'warning'
          ? check.description
          : 'Yopish vaqtida tekshirilib, arxiv snapshotiga muhrlangan.',
    }));
  }
  state.canClose =
    period.status === 'open' && !state.checks.some((check) => check.status === 'blocked');
  return state;
}

export const handlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    await delay(LATENCY_MS);
    const body = (await request.json()) as { login?: string; password?: string };
    const normalized = body.login?.replace(/[\s()-]/g, '');
    const found = userRows.find(
      (user) => user.phone.replace(/[\s()-]/g, '') === normalized && user.status === 'active',
    );
    if (!found || body.password !== 'demo123')
      return problem(401, 'INVALID_CREDENTIALS', 'Telefon yoki parol noto‘g‘ri.');
    signedInUser = structuredClone(found);
    window.sessionStorage.setItem(MOCK_SESSION_KEY, signedInUser.id);
    return ok(signedInUser);
  }),

  http.post(`${API}/auth/logout`, async () => {
    signedInUser = null;
    window.sessionStorage.removeItem(MOCK_SESSION_KEY);
    return noContent();
  }),

  http.get(`${API}/me`, async () => {
    await delay(80);
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(user);
  }),

  http.get(`${API}/branches`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    return ok(branches.filter((branch) => canUseBranch(user, branch.id)));
  }),
  http.get(`${API}/periods`, () => {
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(periodRows);
  }),
  http.get(`${API}/master/categories`, () => {
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(categoryRows);
  }),
  http.get(`${API}/master/departments`, () => {
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(departmentRows);
  }),
  http.get(`${API}/master/payment-methods`, () => {
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(paymentMethodRows);
  }),
  http.get(`${API}/users/directory`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    const hasCenterRead = user.branchScopes.length === branches.length;
    const safeRows: UserDirectoryItem[] = userRows
      .filter(
        (candidate) =>
          hasCenterRead ||
          candidate.id === user.id ||
          candidate.roles.some(
            (assignment) =>
              assignment.branchId !== null && user.branchScopes.includes(assignment.branchId),
          ),
      )
      .map(({ id, fullName, status, roles }) => ({ id, fullName, status, roles }));
    return ok(safeRows);
  }),
  http.get(`${API}/admin/users`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchilarni ko‘rish huquqi yo‘q.');
    return ok(userRows);
  }),

  http.get(`${API}/reports/dashboard`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'dashboard.view'))
      return problem(403, 'PERMISSION_DENIED', 'Dashboardni ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const periodId = url.searchParams.get('period') ?? ids.periodAug;
    if (!periodRows.some((period) => period.id === periodId))
      return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    const requested = url.searchParams.get('branch');
    const branchId = scopedBranchFilter(user, requested);
    if (branchId && !canUseBranch(user, branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    return ok(branchDashboard(branchId, periodId));
  }),

  http.get(`${API}/expenses`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'expense.view_own_branch', 'expense.view_all_branches'))
      return problem(403, 'PERMISSION_DENIED', 'Xarajatlarni ko‘rish huquqi yo‘q.');
    return ok(paginate(filterExpenses(request, user), request));
  }),
  http.get(`${API}/expenses/:id`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'expense.view_own_branch', 'expense.view_all_branches'))
      return problem(403, 'PERMISSION_DENIED', 'Xarajatni ko‘rish huquqi yo‘q.');
    const item = expenseRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'EXPENSE_NOT_FOUND', 'Xarajat topilmadi.');
    if (!hasPermission(user, 'expense.view_all_branches') && !canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    return ok(item);
  }),
  http.post(`${API}/expenses`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'expense.create'))
      return problem(403, 'PERMISSION_DENIED', 'Xarajat kiritish huquqi yo‘q.');
    const body = (await request.json()) as ExpenseCreateInput;
    const branchId = body.branchId ?? user.writeBranchScopes[0];
    if (!branchId || !canWriteBranch(user, branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    const headerKey = request.headers.get('Idempotency-Key');
    if (!headerKey || headerKey !== body.idempotencyKey)
      return problem(
        422,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header va body mos bo‘lishi shart.',
      );
    const dedupeKey = `${user.id}:${headerKey}`;
    const existing = expenseIdempotency.get(dedupeKey);
    if (existing) return ok(existing);
    if (!isPositiveMoney(body.amountUzs))
      return problem(422, 'AMOUNT_INVALID', 'Summa musbat butun so‘mda bo‘lishi kerak.');
    const period = findPeriodForBusinessDate(body.transactionDate);
    if (!period)
      return problem(
        422,
        'DATE_OR_PERIOD_INVALID',
        'Sana haqiqiy va mavjud hisob davriga tegishli bo‘lishi kerak.',
      );
    if (period.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrga yozuv qo‘shib bo‘lmaydi.');
    const category = categoryRows.find((item) => item.id === body.categoryId && item.isActive);
    const method = paymentMethodRows.find(
      (item) => item.id === body.paymentMethodId && item.isActive,
    );
    const department = departmentRows.find(
      (item) => item.id === body.departmentId && item.isActive,
    );
    const responsible = userRows.find((item) => item.id === body.responsibleUserId);
    const branch = branches.find((item) => item.id === branchId);
    if (!category || !method || !department || !responsible || !branch)
      return problem(
        422,
        'REFERENCE_INVALID',
        'Tanlangan ma’lumotlardan biri faol emas yoki topilmadi.',
      );
    const id = `exp-mock-${expenseRows.length + 1}`;
    const created: Expense = {
      id,
      transactionDate: body.transactionDate,
      periodId: period.id,
      branchId,
      branchName: branch.name,
      categoryId: category.id,
      categoryCodeSnapshot: category.code,
      categoryNameSnapshot: category.name,
      expenseTypeSnapshot: category.expenseType,
      description: body.description,
      amountUzs: body.amountUzs,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
      departmentId: department.id,
      departmentName: department.name,
      responsibleUserId: responsible.id,
      responsibleUserName: responsible.fullName,
      enteredBy: user.id,
      enteredByName: user.fullName,
      comment: body.comment ?? null,
      status: 'approved',
      isReversed: false,
      reversalReason: null,
      sourceSheet: null,
      sourceRow: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      audit: [],
    };
    expenseRows = [created, ...expenseRows];
    expenseIdempotency.set(dedupeKey, structuredClone(created));
    return ok(created, 201);
  }),
  http.patch(`${API}/expenses/:id`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'expense.edit'))
      return problem(403, 'PERMISSION_DENIED', 'Xarajatni tahrirlash huquqi yo‘q.');
    const index = expenseRows.findIndex((row) => row.id === params.id);
    const old = expenseRows[index];
    if (!old) return problem(404, 'EXPENSE_NOT_FOUND', 'Xarajat topilmadi.');
    if (!canWriteBranch(user, old.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    if (old.isReversed)
      return problem(409, 'EXPENSE_REVERSED', 'Bekor qilingan yozuv tahrirlanmaydi.');
    const body = (await request.json()) as Partial<ExpenseCreateInput>;
    if (body.amountUzs !== undefined && !isPositiveMoney(body.amountUzs))
      return problem(422, 'AMOUNT_INVALID', 'Summa musbat butun so‘mda bo‘lishi kerak.');
    const oldPeriod = periodRows.find((period) => period.id === old.periodId);
    if (oldPeriod?.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrdagi yozuv tahrirlanmaydi.');
    const transactionDate = body.transactionDate ?? old.transactionDate;
    const targetPeriod = findPeriodForBusinessDate(transactionDate);
    if (!targetPeriod)
      return problem(422, 'DATE_OR_PERIOD_INVALID', 'Sana mavjud hisob davriga tegishli emas.');
    if (targetPeriod.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrga ko‘chirish mumkin emas.');
    const category = categoryRows.find((item) => item.id === (body.categoryId ?? old.categoryId));
    const method = paymentMethodRows.find(
      (item) => item.id === (body.paymentMethodId ?? old.paymentMethodId),
    );
    const department = departmentRows.find(
      (item) => item.id === (body.departmentId ?? old.departmentId),
    );
    const responsible = userRows.find(
      (item) => item.id === (body.responsibleUserId ?? old.responsibleUserId),
    );
    if (!category || !method || !department || !responsible)
      return problem(422, 'REFERENCE_INVALID', 'Tanlangan ma’lumotlardan biri topilmadi.');
    const updated: Expense = {
      ...old,
      transactionDate,
      periodId: targetPeriod.id,
      categoryId: category.id,
      categoryCodeSnapshot: category.code,
      categoryNameSnapshot: category.name,
      expenseTypeSnapshot: category.expenseType,
      description: body.description ?? old.description,
      amountUzs: body.amountUzs ?? old.amountUzs,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
      departmentId: department.id,
      departmentName: department.name,
      responsibleUserId: responsible.id,
      responsibleUserName: responsible.fullName,
      comment: body.comment ?? old.comment,
      id: old.id,
      branchId: old.branchId,
      enteredBy: old.enteredBy,
      enteredByName: old.enteredByName,
      updatedAt: new Date().toISOString(),
    };
    expenseRows[index] = updated;
    return ok(updated);
  }),
  http.post(`${API}/expenses/:id/correct`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'expense.correct_reverse'))
      return problem(403, 'PERMISSION_DENIED', 'Bekor qilish huquqi yo‘q.');
    const item = expenseRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'EXPENSE_NOT_FOUND', 'Xarajat topilmadi.');
    if (!canWriteBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    if (item.isReversed) return problem(409, 'ALREADY_REVERSED', 'Yozuv avval bekor qilingan.');
    if (periodRows.find((period) => period.id === item.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrdagi yozuv bekor qilinmaydi.');
    const body = (await request.json()) as { reason?: string };
    if (!body.reason?.trim() || body.reason.trim().length < 5)
      return problem(422, 'REASON_REQUIRED', 'Bekor qilish sababi kamida 5 ta belgi bo‘lsin.');
    const reversedAt = new Date().toISOString();
    item.isReversed = true;
    item.status = 'reversed';
    item.reversalReason = body.reason.trim();
    item.updatedAt = reversedAt;
    const auditEvent: AuditEvent = {
      id: `audit-expense-reverse-${item.id}-${Date.now()}`,
      occurredAt: reversedAt,
      actorId: user.id,
      actorName: user.fullName,
      action: 'expense.reversed',
      entityType: 'expense',
      entityId: item.id,
      branchId: item.branchId,
      branchName: item.branchName,
      result: 'success',
      reason: item.reversalReason,
      changes: [{ field: 'status', before: 'approved', after: 'reversed' }],
    };
    item.audit = [...item.audit, auditEvent];
    auditRows = [auditEvent, ...auditRows];
    return ok(item);
  }),

  http.get(`${API}/budget-periods/:periodId/versions`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.view'))
      return problem(403, 'PERMISSION_DENIED', 'Budjet versiyalarini ko‘rish huquqi yo‘q.');
    return ok(
      budgetRows
        .filter((row) => row.periodId === params.periodId)
        .sort((a, b) => b.revisionNo - a.revisionNo),
    );
  }),
  http.post(`${API}/budget-periods/:periodId/versions`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Budjet reviziyasini yaratish huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    if (period.status === 'closed')
      return problem(
        409,
        'PERIOD_CLOSED',
        'Yopiq davr uchun yangi budjet reviziyasi yaratilmaydi.',
      );
    const body = (await request.json()) as Partial<BudgetRevisionCreateInput>;
    const reason = body.reason?.trim();
    const periodVersions = budgetRows.filter((row) => row.periodId === period.id);
    const inProgress = periodVersions.find(
      (row) => row.status === 'draft' || row.status === 'submitted',
    );
    if (inProgress)
      return problem(
        409,
        'BUDGET_REVISION_IN_PROGRESS',
        `#${inProgress.revisionNo} reviziya hali ${inProgress.status === 'draft' ? 'qoralama' : 'tasdiqda'}. Avval shu oqimni yakunlang.`,
        { versionId: inProgress.id, revisionNo: inProgress.revisionNo },
      );
    const source = periodVersions
      .filter((row) => row.status === 'approved' || row.status === 'locked')
      .sort((a, b) => b.revisionNo - a.revisionNo)[0];
    if (!source)
      return problem(
        409,
        'BUDGET_REVISION_SOURCE_REQUIRED',
        'Yangi reviziya uchun tasdiqlangan yoki qulflangan manba versiya topilmadi.',
      );
    if (!reason || reason.length < 5)
      return problem(
        422,
        'REASON_REQUIRED',
        'Reviziya sababi kamida 5 ta belgidan iborat bo‘lsin.',
      );
    const revisionNo = Math.max(0, ...periodVersions.map((row) => row.revisionNo)) + 1;
    const createdAt = new Date().toISOString();
    const clonedLines = source.lines.map((line, index) => ({
      ...line,
      id: `bl-${period.id}-r${revisionNo}-${index + 1}`,
    }));
    const existingKeys = new Set(clonedLines.map((line) => `${line.branchId}:${line.categoryId}`));
    const missingLines = categoryRows
      .filter((category) => category.isActive)
      .flatMap((category) =>
        branches
          .filter((branch) => !existingKeys.has(`${branch.id}:${category.id}`))
          .map((branch, index) => ({
            id: `bl-${period.id}-r${revisionNo}-new-${category.id}-${index + 1}`,
            branchId: branch.id,
            branchName: branch.name,
            categoryId: category.id,
            categoryCodeSnapshot: category.code,
            categoryNameSnapshot: category.name,
            expenseTypeSnapshot: category.expenseType,
            plannedAmountUzs: null,
            actualAmountUzs: sumMoney(
              expenseRows
                .filter(
                  (expense) =>
                    expense.periodId === period.id &&
                    expense.branchId === branch.id &&
                    expense.categoryId === category.id &&
                    !expense.isReversed,
                )
                .map((expense) => expense.amountUzs),
            ),
            varianceUzs: null,
            reason: null,
            hasPlan: false,
          })),
      );
    const created: BudgetVersion = {
      id: `budget-${period.id}-r${revisionNo}-${Date.now()}`,
      periodId: period.id,
      periodLabel: period.label,
      revisionNo,
      status: 'draft',
      reason,
      createdByName: user.fullName,
      submittedByName: null,
      approvedByName: null,
      createdAt,
      lines: [...clonedLines, ...missingLines],
    };
    budgetRows = [created, ...budgetRows];
    return ok(created, 201);
  }),
  http.get(`${API}/budget-versions/:id`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.view'))
      return problem(403, 'PERMISSION_DENIED', 'Budjet versiyasini ko‘rish huquqi yo‘q.');
    const item = budgetRows.find((row) => row.id === params.id);
    return item ? ok(item) : problem(404, 'BUDGET_NOT_FOUND', 'Budjet versiyasi topilmadi.');
  }),
  http.put(`${API}/budget-versions/:id/lines`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Budjetni tahrirlash huquqi yo‘q.');
    const item = budgetRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'BUDGET_NOT_FOUND', 'Budjet versiyasi topilmadi.');
    if (item.status !== 'draft')
      return problem(409, 'BUDGET_LOCKED', 'Faqat qoralama revision tahrirlanadi.');
    const period = periodRows.find((row) => row.id === item.periodId);
    if (period?.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi budjet reviziyasi tahrirlanmaydi.');
    const body = (await request.json()) as {
      lines: Array<
        Pick<
          BudgetVersion['lines'][number],
          'branchId' | 'categoryId' | 'plannedAmountUzs' | 'reason'
        >
      >;
    };
    if (
      !Array.isArray(body.lines) ||
      body.lines.some(
        (line) => line.plannedAmountUzs !== null && !isNonNegativeMoney(line.plannedAmountUzs),
      )
    )
      return problem(
        422,
        'BUDGET_AMOUNT_INVALID',
        'Budjet qiymati null yoki manfiy bo‘lmagan butun so‘m bo‘lishi kerak.',
      );
    item.lines = item.lines.map((oldLine) => {
      const input = body.lines.find(
        (line) => line.branchId === oldLine.branchId && line.categoryId === oldLine.categoryId,
      );
      if (!input) return oldLine;
      const hasPlan = input.plannedAmountUzs !== null;
      return {
        ...oldLine,
        plannedAmountUzs: input.plannedAmountUzs,
        reason: input.reason,
        hasPlan,
        varianceUzs:
          hasPlan && input.plannedAmountUzs !== null
            ? (BigInt(input.plannedAmountUzs) - BigInt(oldLine.actualAmountUzs)).toString()
            : null,
      };
    });
    return ok(item);
  }),
  http.post(`${API}/budget-versions/:id/submit`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.submit'))
      return problem(403, 'PERMISSION_DENIED', 'Budjetni yuborish huquqi yo‘q.');
    const item = budgetRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'BUDGET_NOT_FOUND', 'Budjet versiyasi topilmadi.');
    if (item.status !== 'draft')
      return problem(409, 'INVALID_STATE_TRANSITION', 'Faqat qoralama budjet yuboriladi.');
    if (periodRows.find((row) => row.id === item.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi budjet tasdiqqa yuborilmaydi.');
    item.status = 'submitted';
    item.submittedByName = user.fullName;
    return ok(item);
  }),
  http.post(`${API}/budget-versions/:id/approve`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.approve'))
      return problem(403, 'PERMISSION_DENIED', 'Budjetni tasdiqlash huquqi yo‘q.');
    const item = budgetRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'BUDGET_NOT_FOUND', 'Budjet versiyasi topilmadi.');
    if (item.status !== 'submitted')
      return problem(409, 'INVALID_STATE_TRANSITION', 'Faqat yuborilgan budjet tasdiqlanadi.');
    if (periodRows.find((row) => row.id === item.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi budjet tasdiqlanmaydi.');
    budgetRows.forEach((version) => {
      if (
        version.periodId === item.periodId &&
        version.id !== item.id &&
        version.status === 'approved'
      )
        version.status = 'locked';
    });
    item.status = 'approved';
    item.approvedByName = user.fullName;
    refreshOperationalState();
    return ok(item);
  }),

  http.get(`${API}/revenue-plans`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejalarini ko‘rish huquqi yo‘q.');
    const periodId = new URL(request.url).searchParams.get('periodId');
    return ok(
      revenuePlanRows
        .filter((row) => canUseBranch(user, row.branchId))
        .filter((row) => !periodId || row.periodId === periodId),
    );
  }),
  http.get(`${API}/revenue-plans/summary`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum reja jamini ko‘rish huquqi yo‘q.');
    const periodId = new URL(request.url).searchParams.get('periodId') ?? '';
    const period = periodRows.find((item) => item.id === periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    const visibleBranches = branches.filter((branch) => canUseBranch(user, branch.id));
    const effectivePlans = visibleBranches.flatMap((branch) => {
      const latest = revenuePlanRows
        .filter(
          (plan) =>
            plan.periodId === periodId &&
            plan.branchId === branch.id &&
            (plan.status === 'approved' || plan.status === 'locked'),
        )
        .sort((a, b) => b.revisionNo - a.revisionNo)[0];
      return latest ? [latest] : [];
    });
    const summary: RevenuePlanSummary = {
      period,
      expectedBranchCount: visibleBranches.length,
      branchesWithPlan: effectivePlans.length,
      planComplete: effectivePlans.length === visibleBranches.length,
      totalPlannedAmountUzs: sumMoney(effectivePlans.map((plan) => plan.plannedAmountUzs)),
    };
    return ok(summary);
  }),
  http.get(`${API}/revenue-plans/:id`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejasini ko‘rish huquqi yo‘q.');
    const item = revenuePlanRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'REVENUE_PLAN_NOT_FOUND', 'Tushum rejasi topilmadi.');
    if (!canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial rejasini ko‘rish huquqi yo‘q.');
    return ok(item);
  }),
  http.post(`${API}/revenue-plans`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejasini yaratish huquqi yo‘q.');
    const body = (await request.json()) as Partial<RevenuePlan>;
    if (!body.branchId || !isNonNegativeMoney(body.plannedAmountUzs))
      return problem(422, 'VALIDATION_ERROR', 'Filial va reja summasi majburiy.');
    const branch = branches.find((item) => item.id === body.branchId);
    if (!branch) return problem(422, 'BRANCH_INVALID', 'Filial topilmadi.');
    if (!canUseBranch(user, branch.id))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial rejasini boshqarish huquqi yo‘q.');
    const period = periodRows.find((item) => item.id === (body.periodId ?? ids.periodAug));
    if (!period) return problem(422, 'PERIOD_INVALID', 'Hisob davri topilmadi.');
    if (period.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopiq davr uchun reja yaratilmaydi.');
    const existing = revenuePlanRows.filter(
      (plan) => plan.periodId === period.id && plan.branchId === branch.id,
    );
    if (existing.some((plan) => plan.status === 'draft' || plan.status === 'submitted'))
      return problem(
        409,
        'REVISION_CONFLICT',
        'Bu filial va davr uchun yakunlanmagan reviziya mavjud.',
      );
    const revisionNo = Math.max(0, ...existing.map((plan) => plan.revisionNo)) + 1;
    const created: RevenuePlan = {
      id: `rp-${Date.now()}`,
      periodId: period.id,
      periodLabel: period.label,
      branchId: branch.id,
      branchName: branch.name,
      plannedAmountUzs: body.plannedAmountUzs,
      revisionNo,
      status: 'draft',
      reason: body.reason ?? null,
      submittedByName: null,
      approvedByName: null,
      updatedAt: new Date().toISOString(),
    };
    revenuePlanRows = [...revenuePlanRows, created];
    return ok(created, 201);
  }),
  http.patch(`${API}/revenue-plans/:id`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejasini tahrirlash huquqi yo‘q.');
    const item = revenuePlanRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'REVENUE_PLAN_NOT_FOUND', 'Tushum rejasi topilmadi.');
    if (!canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial rejasini tahrirlash huquqi yo‘q.');
    if (item.status !== 'draft')
      return problem(
        409,
        'REVISION_REQUIRED',
        'Tasdiqqa yuborilgan, tasdiqlangan yoki locked reja overwrite qilinmaydi; yangi reviziya yarating.',
      );
    if (periodRows.find((period) => period.id === item.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi tushum rejasi tahrirlanmaydi.');
    const body = (await request.json()) as {
      plannedAmountUzs?: MoneyUzs;
      reason?: string;
    };
    if (body.plannedAmountUzs !== undefined && !isNonNegativeMoney(body.plannedAmountUzs))
      return problem(422, 'AMOUNT_INVALID', 'Reja summasi manfiy bo‘lmagan butun so‘m bo‘lsin.');
    if (body.plannedAmountUzs !== undefined) item.plannedAmountUzs = body.plannedAmountUzs;
    if (body.reason !== undefined) item.reason = body.reason.trim() || null;
    item.updatedAt = new Date().toISOString();
    return ok(item);
  }),
  http.post(`${API}/revenue-plans/:id/approve`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.approve'))
      return problem(403, 'PERMISSION_DENIED', 'Rejani tasdiqlash huquqi yo‘q.');
    const item = revenuePlanRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'REVENUE_PLAN_NOT_FOUND', 'Tushum rejasi topilmadi.');
    if (!canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial rejasini tasdiqlash huquqi yo‘q.');
    if (item.status !== 'submitted')
      return problem(409, 'INVALID_STATE_TRANSITION', 'Faqat yuborilgan reja tasdiqlanadi.');
    if (periodRows.find((period) => period.id === item.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi tushum rejasi tasdiqlanmaydi.');
    revenuePlanRows.forEach((plan) => {
      if (
        plan.id !== item.id &&
        plan.periodId === item.periodId &&
        plan.branchId === item.branchId &&
        plan.status === 'approved'
      )
        plan.status = 'locked';
    });
    item.status = 'approved';
    item.approvedByName = user.fullName;
    item.updatedAt = new Date().toISOString();
    refreshOperationalState();
    return ok(item);
  }),
  http.post(`${API}/revenue-plans/:id/submit`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.submit'))
      return problem(403, 'PERMISSION_DENIED', 'Rejani yuborish huquqi yo‘q.');
    const item = revenuePlanRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'REVENUE_PLAN_NOT_FOUND', 'Tushum rejasi topilmadi.');
    if (!canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial rejasini yuborish huquqi yo‘q.');
    if (item.status !== 'draft')
      return problem(409, 'INVALID_STATE_TRANSITION', 'Faqat qoralama reja yuboriladi.');
    if (periodRows.find((period) => period.id === item.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi tushum rejasi tasdiqqa yuborilmaydi.');
    item.status = 'submitted';
    item.submittedByName = user.fullName;
    item.updatedAt = new Date().toISOString();
    return ok(item);
  }),
  http.get(`${API}/revenue-transactions`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue.view_own', 'revenue.view_all'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumlarni ko‘rish huquqi yo‘q.');
    return ok(paginate(filterRevenue(request, user), request));
  }),
  http.get(`${API}/revenue-transactions/:id`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue.view_own', 'revenue.view_all'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumni ko‘rish huquqi yo‘q.');
    const item = revenueRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'REVENUE_NOT_FOUND', 'Tushum topilmadi.');
    if (!hasPermission(user, 'revenue.view_all') && !canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    return ok(item);
  }),
  http.post(`${API}/revenue-transactions`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue.create'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum kiritish huquqi yo‘q.');
    const body = (await request.json()) as RevenueCreateInput;
    if (!/[+-]\d{2}:\d{2}$|Z$/.test(body.paymentAt) || Number.isNaN(Date.parse(body.paymentAt)))
      return problem(
        422,
        'TIMESTAMP_OFFSET_REQUIRED',
        'Sana/vaqt RFC3339 va timezone offset bilan bo‘lishi kerak.',
      );
    const branchId = body.branchId ?? user.writeBranchScopes[0];
    if (!branchId || !canWriteBranch(user, branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    const headerKey = request.headers.get('Idempotency-Key');
    if (!headerKey || headerKey !== body.idempotencyKey)
      return problem(
        422,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header va body mos bo‘lishi shart.',
      );
    const dedupeKey = `${user.id}:${headerKey}`;
    const existing = revenueIdempotency.get(dedupeKey);
    if (existing) return ok(existing);
    if (!isPositiveMoney(body.amountUzs))
      return problem(422, 'AMOUNT_INVALID', 'Summa musbat butun so‘mda bo‘lishi kerak.');
    const collectorId = body.collectorUserId ?? user.id;
    const onBehalf = collectorId !== user.id;
    if (
      onBehalf &&
      (!hasPermission(user, 'revenue.enter_on_behalf') || !body.onBehalfReason?.trim())
    )
      return problem(
        403,
        'ON_BEHALF_DENIED',
        'Boshqa kassir nomidan kiritish uchun huquq va sabab majburiy.',
      );
    const collector = userRows.find(
      (item) =>
        item.id === collectorId &&
        item.status === 'active' &&
        item.roles.some((role) => role.role === 'cashier' && role.branchId === branchId),
    );
    const method = paymentMethodRows.find(
      (item) => item.id === body.paymentMethodId && item.isActive,
    );
    const branch = branches.find((item) => item.id === branchId);
    if (!collector || !method || !branch)
      return problem(422, 'REFERENCE_INVALID', 'Kassir, kanal yoki filial mos emas.');
    const paymentBusinessDate = localBusinessDate(body.paymentAt);
    const period = findPeriodForBusinessDate(paymentBusinessDate);
    if (!period)
      return problem(
        422,
        'DATE_OR_PERIOD_INVALID',
        'To‘lov vaqti mavjud hisob davriga tegishli emas.',
      );
    if (period.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrga tushum kiritib bo‘lmaydi.');
    const externalReference = body.externalReference?.trim() || null;
    const duplicateReference = externalReference
      ? revenueRows.find(
          (item) =>
            item.branchId === branchId &&
            item.externalReference?.toLocaleLowerCase('uz') ===
              externalReference.toLocaleLowerCase('uz'),
        )
      : null;
    if (duplicateReference)
      return problem(
        409,
        'DUPLICATE_REFERENCE',
        'Bu filialda tashqi ma’lumotnoma avval ishlatilgan.',
        { transactionId: duplicateReference.id },
      );
    const created: RevenueTransaction = {
      id: `rev-mock-${revenueRows.length + 1}`,
      receiptNo: String(100001 + revenueRows.length),
      paymentAt: body.paymentAt,
      paymentBusinessDate,
      timePrecision: 'exact',
      periodId: period.id,
      branchId,
      branchName: branch.name,
      amountUzs: body.amountUzs,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
      collectorUserId: collector.id,
      collectorName: collector.fullName,
      enteredBy: user.id,
      enteredByName: user.fullName,
      enteredOnBehalf: onBehalf,
      onBehalfReason: onBehalf ? (body.onBehalfReason?.trim() ?? null) : null,
      externalReference,
      description: body.description,
      status: 'posted',
      reversalReason: null,
      createdAt: new Date().toISOString(),
      audit: [],
    };
    revenueRows = [created, ...revenueRows];
    revenueIdempotency.set(dedupeKey, structuredClone(created));
    return ok(created, 201);
  }),
  http.post(`${API}/revenue-transactions/:id/reverse`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue.reverse'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumni bekor qilish huquqi yo‘q.');
    const item = revenueRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'REVENUE_NOT_FOUND', 'Tushum topilmadi.');
    if (item.status === 'reversed')
      return problem(409, 'ALREADY_REVERSED', 'Tushum avval bekor qilingan.');
    if (!canWriteBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    if (periodRows.find((period) => period.id === item.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrdagi tushum bekor qilinmaydi.');
    const body = (await request.json()) as { reason?: string };
    if (!body.reason?.trim() || body.reason.trim().length < 8)
      return problem(422, 'REASON_REQUIRED', 'Bekor qilish sababi kamida 8 ta belgi bo‘lsin.');
    const reversedAt = new Date().toISOString();
    item.status = 'reversed';
    item.reversalReason = body.reason.trim();
    const auditEvent: AuditEvent = {
      id: `audit-revenue-reverse-${item.id}-${Date.now()}`,
      occurredAt: reversedAt,
      actorId: user.id,
      actorName: user.fullName,
      action: 'revenue.reversed',
      entityType: 'revenue_transaction',
      entityId: item.id,
      branchId: item.branchId,
      branchName: item.branchName,
      result: 'success',
      reason: item.reversalReason,
      changes: [{ field: 'status', before: 'posted', after: 'reversed' }],
    };
    item.audit = [...item.audit, auditEvent];
    auditRows = [auditEvent, ...auditRows];
    return ok(item);
  }),
  http.get(`${API}/reports/revenue`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'reports.view'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum hisobotini ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const periodId = url.searchParams.get('periodId') ?? '';
    if (!periodRows.some((period) => period.id === periodId))
      return problem(422, 'PERIOD_INVALID', 'Hisob davri topilmadi.');
    const branchId = scopedBranchFilter(user, url.searchParams.get('branch'));
    if (branchId && !canUseBranch(user, branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial hisobotini ko‘rish huquqi yo‘q.');
    return ok(buildRevenueReport(periodId, branchId));
  }),
  http.get(`${API}/reports/cashiers`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'reports.view_cashiers'))
      return problem(403, 'PERMISSION_DENIED', 'Kassirlar kesimini ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const branchId = scopedBranchFilter(user, url.searchParams.get('branch'));
    if (branchId && !canUseBranch(user, branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial hisobotini ko‘rish huquqi yo‘q.');
    const periodId = url.searchParams.get('period') ?? ids.periodAug;
    const period = periodRows.find((item) => item.id === periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    const collectorFilter = url.searchParams.get('collector');
    const visibleBranchIds = new Set(
      branches
        .filter((branch) => canUseBranch(user, branch.id) && (!branchId || branch.id === branchId))
        .map((branch) => branch.id),
    );
    const posted = revenueRows.filter(
      (row) =>
        row.periodId === periodId && row.status === 'posted' && visibleBranchIds.has(row.branchId),
    );
    const rosterKeys = new Set(
      userRows.flatMap((candidate) =>
        candidate.roles
          .filter(
            (role) =>
              role.role === 'cashier' && role.branchId && visibleBranchIds.has(role.branchId),
          )
          .map((role) => `${candidate.id}:${role.branchId}`),
      ),
    );
    posted.forEach((row) => rosterKeys.add(`${row.collectorUserId}:${row.branchId}`));
    const summaries = [...rosterKeys].map((key) => {
      const [collectorUserId = '', collectorBranchId = ''] = key.split(':');
      const collectorRows = posted.filter(
        (row) => row.collectorUserId === collectorUserId && row.branchId === collectorBranchId,
      );
      const branchRows = posted.filter((row) => row.branchId === collectorBranchId);
      const totalUzs = sumMoney(collectorRows.map((row) => row.amountUzs));
      const branchTotal = sumMoney(branchRows.map((row) => row.amountUzs));
      const collector = userRows.find((candidate) => candidate.id === collectorUserId);
      const branch = branches.find((candidate) => candidate.id === collectorBranchId);
      const byMethod = (methodId: string) =>
        sumMoney(
          collectorRows
            .filter((row) => row.paymentMethodId === methodId)
            .map((row) => row.amountUzs),
        );
      return {
        collectorUserId,
        collectorName: collector?.fullName ?? collectorRows[0]?.collectorName ?? 'Tarixiy kassir',
        branchId: collectorBranchId,
        branchName: branch?.name ?? collectorRows[0]?.branchName ?? 'Tarixiy filial',
        isActive: collector?.status === 'active',
        totalUzs,
        transactionCount: collectorRows.length,
        cashUzs: byMethod(ids.cash),
        cardUzs: byMethod(ids.card),
        bankUzs: byMethod(ids.bank),
        branchSharePct: percentageValue(totalUzs, branchTotal),
      };
    });
    const filtered = summaries
      .filter((item) => !collectorFilter || item.collectorUserId === collectorFilter)
      .sort((a, b) => Number(BigInt(b.totalUzs) - BigInt(a.totalUzs)));
    return ok({
      period,
      branchFilter: branchId ?? 'all',
      collectorFilter: collectorFilter ?? 'all',
      items: filtered,
      summary: {
        totalUzs: sumMoney(filtered.map((item) => item.totalUzs)),
        cashierCount: filtered.length,
        inactiveCount: filtered.filter((item) => !item.isActive).length,
      },
    });
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
    budgetRows.forEach((version) => {
      version.lines.forEach((line) => {
        if (!historicalCategoryMap.has(line.categoryId))
          historicalCategoryMap.set(line.categoryId, {
            id: line.categoryId,
            code: line.categoryCodeSnapshot,
            name: line.categoryNameSnapshot,
            expenseType: line.expenseTypeSnapshot,
          });
      });
    });
    expenseRows.forEach((expense) => {
      if (!historicalCategoryMap.has(expense.categoryId))
        historicalCategoryMap.set(expense.categoryId, {
          id: expense.categoryId,
          code: expense.categoryCodeSnapshot,
          name: expense.categoryNameSnapshot,
          expenseType: expense.expenseTypeSnapshot,
        });
    });
    categoryRows.forEach((category) => {
      if (!historicalCategoryMap.has(category.id))
        historicalCategoryMap.set(category.id, {
          id: category.id,
          code: category.code,
          name: category.name,
          expenseType: category.expenseType,
        });
    });
    const reportCategories = [...historicalCategoryMap.values()];
    const selectedBranchIds = new Set(
      branchFilter === 'all' ? user.branchScopes : [branchFilter],
    );
    const rows = reportCategories.map((category) => {
      const months = Array.from({ length: 12 }, (_, monthIndex) => {
        const period = periodRows.find(
          (candidate) => candidate.year === requestedYear && candidate.month === monthIndex + 1,
        );
        const budget = period ? latestApprovedBudget(period.id) : undefined;
        const plannedLines =
          budget?.lines.filter(
            (line) =>
              line.categoryId === category.id &&
              selectedBranchIds.has(line.branchId) &&
              line.plannedAmountUzs !== null,
          ) ?? [];
        const planned = plannedLines.length
          ? sumMoney(plannedLines.map((line) => line.plannedAmountUzs ?? '0'))
          : null;
        const actualRows = period
          ? expenseRows.filter(
              (expense) =>
                expense.periodId === period.id &&
                selectedBranchIds.has(expense.branchId) &&
                expense.categoryId === category.id &&
                !expense.isReversed,
            )
          : [];
        const actual = sumMoney(actualRows.map((expense) => expense.amountUzs));
        return {
          month: monthIndex + 1,
          planActual: planActual(planned, actual, plannedLines.length > 0),
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
    });
  }),
  http.get(`${API}/reports/branch-comparison`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'reports.view'))
      return problem(403, 'PERMISSION_DENIED', 'Filiallar hisobotini ko‘rish huquqi yo‘q.');
    const branchSummary = (
      branchId: string,
      plannedExpense: string,
      actualExpense: string,
      plannedRevenue: string,
      actualRevenue: string,
    ) => {
      const branch = branches.find((item) => item.id === branchId)!;
      return {
        branch: { id: branch.id, code: branch.code, name: branch.name, snapshotName: branch.name },
        expense: planActual(plannedExpense, actualExpense),
        revenue: revenueKpi(plannedRevenue, actualRevenue),
      };
    };
    const totalSummary = (
      plannedExpense: string,
      actualExpense: string,
      plannedRevenue: string,
      actualRevenue: string,
      branchCount = 2,
    ) => ({
      branch: { id: 'all', code: 'ALL', name: 'Markaz jami', snapshotName: 'Markaz jami' },
      expense: planActual(plannedExpense, actualExpense),
      revenue: revenueKpi(plannedRevenue, actualRevenue, branchCount, branchCount),
    });
    const requestedYear = Number(new URL(request.url).searchParams.get('year') || 2026);
    if (requestedYear !== 2026)
      return ok({
        year: requestedYear,
        months: [],
        annual: { branches: [], total: totalSummary('0', '0', '0', '0', 0) },
      });
    const months = Array.from({ length: 12 }, (_, index) => {
      const active = index <= 7;
      const sayxun = branchSummary(
        ids.sayxun,
        '80000000',
        active ? String(52_000_000 + index * 2_500_000) : '0',
        '160000000',
        active ? String(115_000_000 + index * 5_000_000) : '0',
      );
      const xalqlar = branchSummary(
        ids.xalqlar,
        '45000000',
        active ? String(28_000_000 + index * 1_700_000) : '0',
        '140000000',
        active ? String(70_000_000 + index * 3_000_000) : '0',
      );
      const visible = [sayxun, xalqlar].filter((item) => canUseBranch(user, item.branch.id));
      const totalExpensePlan = sumMoney(
        visible.map((item) => item.expense.plannedAmountUzs ?? '0'),
      );
      const totalExpenseActual = sumMoney(visible.map((item) => item.expense.actualAmountUzs));
      const totalRevenuePlan = sumMoney(
        visible.map((item) => item.revenue.expectedRevenueUzs ?? '0'),
      );
      const totalRevenueActual = sumMoney(visible.map((item) => item.revenue.actualRevenueUzs));
      return {
        month: index + 1,
        branches: visible,
        total: totalSummary(
          totalExpensePlan,
          active ? totalExpenseActual : '0',
          totalRevenuePlan,
          active ? totalRevenueActual : '0',
          visible.length,
        ),
      };
    });
    const annualBranches = [
      branchSummary(ids.sayxun, '640000000', '560000000', '1280000000', '1040000000'),
      branchSummary(ids.xalqlar, '360000000', '320000000', '1120000000', '640000000'),
    ].filter((item) => canUseBranch(user, item.branch.id));
    const annualExpensePlan = sumMoney(
      annualBranches.map((item) => item.expense.plannedAmountUzs ?? '0'),
    );
    const annualExpenseActual = sumMoney(
      annualBranches.map((item) => item.expense.actualAmountUzs),
    );
    const annualRevenuePlan = sumMoney(
      annualBranches.map((item) => item.revenue.expectedRevenueUzs ?? '0'),
    );
    const annualRevenueActual = sumMoney(
      annualBranches.map((item) => item.revenue.actualRevenueUzs),
    );
    return ok({
      year: requestedYear,
      months,
      annual: {
        branches: annualBranches,
        total: totalSummary(
          annualExpensePlan,
          annualExpenseActual,
          annualRevenuePlan,
          annualRevenueActual,
          annualBranches.length,
        ),
      },
    });
  }),
  http.get(`${API}/reports/profit-loss`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'reports.view'))
      return problem(403, 'PERMISSION_DENIED', 'Moliyaviy hisobotni ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const requestedBranch = url.searchParams.get('branch') || 'all';
    if (requestedBranch !== 'all' && !canUseBranch(user, requestedBranch))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial hisobotini ko‘rish huquqi yo‘q.');
    const periodId = url.searchParams.get('period') ?? ids.periodAug;
    const period = periodRows.find((item) => item.id === periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    const normalizedBranch = scopedBranchFilter(user, requestedBranch);
    const branchFilter = normalizedBranch ?? 'all';
    const summary = branchDashboard(normalizedBranch, periodId);
    const net = BigInt(summary.netResultUzs);
    return ok({
      period,
      branchFilter,
      actualRevenueUzs: summary.revenueActualUzs,
      actualExpenseUzs: summary.expenseActualUzs,
      netFinancialResultUzs: summary.netResultUzs,
      netMarginPercent: summary.netMarginPct,
      label: net > 0n ? 'Foyda' : net < 0n ? 'Zarar' : 'Nol natija',
    });
  }),

  http.get(`${API}/reports/data-quality`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'import.run'))
      return problem(403, 'PERMISSION_DENIED', 'Data-quality hisobotini ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const severity = url.searchParams.get('severity');
    const issueType = url.searchParams.get('issueType');
    const branch = url.searchParams.get('branch');
    const search = url.searchParams.get('search')?.toLocaleLowerCase('uz') ?? '';
    const scoped = dqRows
      .filter((row) => !row.branchId || canUseBranch(user, row.branchId))
      .filter((row) => !branch || branch === 'all' || row.branchId === branch);
    const filtered = scoped
      .filter((row) => !status || status === 'all' || row.status === status)
      .filter((row) => !severity || severity === 'all' || row.severity === severity)
      .filter((row) => !issueType || issueType === 'all' || row.issueType === issueType)
      .filter(
        (row) =>
          !search ||
          `${row.title} ${row.detail} ${row.sourceSheet}`.toLocaleLowerCase('uz').includes(search),
      );
    const page = paginate(filtered, request);
    const open = scoped.filter((row) => row.status === 'open');
    return ok({
      ...page,
      summary: {
        openCount: open.length,
        openAmountUzs: sumMoney(open.map((row) => row.amountUzs)),
      },
    });
  }),
  http.post(`${API}/data-quality-exceptions/:id/resolve`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'import.resolve_exception'))
      return problem(403, 'PERMISSION_DENIED', 'Exceptionni hal qilish huquqi yo‘q.');
    const item = dqRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'DQ_EXCEPTION_NOT_FOUND', 'Data-quality exception topilmadi.');
    if (item.branchId && !canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial exceptionini hal qilish huquqi yo‘q.');
    if (item.status !== 'open')
      return problem(409, 'DQ_ALREADY_RESOLVED', 'Exception allaqachon yakunlangan.');
    const body = (await request.json()) as {
      reason?: string;
      correctedDate?: string;
      categoryId?: string;
    };
    if (!body.reason?.trim() || body.reason.trim().length < 5)
      return problem(422, 'REASON_REQUIRED', 'Hal qilish sababi kamida 5 ta belgi bo‘lsin.');
    const resolvedCategory = body.categoryId
      ? categoryRows.find((category) => category.id === body.categoryId && category.isActive)
      : undefined;
    if (item.issueType === 'unknown_category' && !resolvedCategory)
      return problem(
        422,
        'CATEGORY_REQUIRED',
        'Kategoriyasiz satr uchun faol canonical kategoriya tanlanishi shart.',
      );
    if (
      item.issueType === 'invalid_date' &&
      (!body.correctedDate || findPeriodForBusinessDate(body.correctedDate)?.id !== ids.periodAug)
    )
      return problem(
        422,
        'CORRECTED_DATE_REQUIRED',
        'Xato sana uchun Avgust 2026 ga tegishli haqiqiy YYYY-MM-DD sana kiriting.',
      );
    item.status = 'resolved';
    item.ownerName = user.fullName;
    item.resolutionReason = body.reason.trim();
    item.resolvedAt = new Date().toISOString();
    item.correctedDate = body.correctedDate ?? null;
    item.resolvedCategoryId = resolvedCategory?.id ?? null;
    item.resolvedCategoryName = resolvedCategory?.name ?? null;
    if (
      item.issueType === 'unknown_category' &&
      importJob.status === 'completed' &&
      !legacyImportedLedgerRows.some((row) => row.sourceRow === 27)
    ) {
      syncLegacyImportedExpenses(true, resolvedCategory?.id);
      importJob = {
        ...importJob,
        exceptionRows: 0,
        recoveredAmountUzs: '6318400',
        message: '43 ta text-date satrining barchasi ledgerga yozildi; import tafovuti yopildi.',
      };
    }
    refreshOperationalState();
    return ok(item);
  }),

  http.get(`${API}/imports/latest`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'import.run'))
      return problem(403, 'PERMISSION_DENIED', 'Importlarni ko‘rish huquqi yo‘q.');
    return ok(importJob);
  }),
  http.post(`${API}/imports/legacy-normalize`, async () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'import.run'))
      return problem(403, 'PERMISSION_DENIED', 'Importni ishga tushirish huquqi yo‘q.');
    if (importJob.status === 'completed') return ok(importJob);
    importJob = {
      ...importJob,
      status: 'running',
      startedAt: new Date().toISOString(),
      message: 'Text-date qiymatlari Asia/Tashkent biznes sanasiga normalizatsiya qilinmoqda.',
    };
    await delay(250);
    const dateIssue = dqRows.find((row) => row.issueType === 'invalid_date');
    if (dateIssue) {
      dateIssue.status = 'resolved';
      dateIssue.ownerName = user.fullName;
      dateIssue.resolutionReason = 'Legacy import parseri DD.MM.YYYY sanani normalizatsiya qildi.';
      dateIssue.resolvedAt = new Date().toISOString();
      dateIssue.correctedDate = '2026-08-15';
    }
    const categoryIssueOpen = dqRows.some(
      (row) => row.issueType === 'unknown_category' && row.status === 'open',
    );
    const resolvedCategoryId = dqRows.find(
      (row) => row.issueType === 'unknown_category',
    )?.resolvedCategoryId;
    syncLegacyImportedExpenses(!categoryIssueOpen, resolvedCategoryId ?? undefined);
    importJob = {
      ...importJob,
      status: 'completed',
      normalizedRows: 43,
      exceptionRows: categoryIssueOpen ? 1 : 0,
      recoveredAmountUzs: categoryIssueOpen ? '6068400' : '6318400',
      completedAt: new Date().toISOString(),
      message: categoryIssueOpen
        ? '43 ta text-date normalizatsiya qilindi: 42 satr ledgerga, kategoriyasiz 1 satr explicit exceptionga yo‘naltirildi.'
        : '43 ta text-date satrining barchasi ledgerga yozildi; import tafovuti yopildi.',
    };
    refreshOperationalState();
    return ok(importJob);
  }),

  http.post(`${API}/master/:kind`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'master_data.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Master data boshqaruvi uchun ruxsat yo‘q.');
    const body = (await request.json()) as {
      code?: string;
      name?: string;
      expenseType?: 'fixed' | 'variable';
    };
    if (!body.code?.trim() || !body.name?.trim())
      return problem(422, 'VALIDATION_ERROR', 'Kod va nom majburiy.');
    const normalizedCode = body.code.trim().toUpperCase();
    const targetRows =
      params.kind === 'categories'
        ? categoryRows
        : params.kind === 'departments'
          ? departmentRows
          : params.kind === 'payment-methods'
            ? paymentMethodRows
            : null;
    if (!targetRows) return problem(404, 'MASTER_KIND_NOT_FOUND', 'Master data turi topilmadi.');
    if (targetRows.some((item) => item.code.toUpperCase() === normalizedCode))
      return problem(409, 'DUPLICATE_REFERENCE', 'Bu master-data kodi allaqachon mavjud.');
    const base = {
      id: `master-${Date.now()}`,
      code: normalizedCode,
      name: body.name.trim(),
      isActive: true,
    };
    if (params.kind === 'categories') {
      const created = { ...base, expenseType: body.expenseType ?? 'variable', aliases: [] };
      categoryRows = [...categoryRows, created];
      return ok(created, 201);
    }
    if (params.kind === 'departments') {
      departmentRows = [...departmentRows, base];
      return ok(base, 201);
    }
    if (params.kind === 'payment-methods') {
      paymentMethodRows = [...paymentMethodRows, base];
      return ok(base, 201);
    }
    return problem(404, 'MASTER_KIND_NOT_FOUND', 'Master data turi topilmadi.');
  }),
  http.patch(`${API}/master/:kind/:id`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'master_data.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Master data boshqaruvi uchun ruxsat yo‘q.');
    const body = (await request.json()) as {
      isActive?: boolean;
      name?: string;
      expenseType?: 'fixed' | 'variable';
    };
    const rows =
      params.kind === 'categories'
        ? categoryRows
        : params.kind === 'departments'
          ? departmentRows
          : params.kind === 'payment-methods'
            ? paymentMethodRows
            : null;
    const item = rows?.find((row) => row.id === params.id);
    if (!item) return problem(404, 'MASTER_ITEM_NOT_FOUND', 'Master data elementi topilmadi.');
    if (typeof body.isActive === 'boolean') item.isActive = body.isActive;
    if (body.name?.trim()) item.name = body.name.trim();
    if (params.kind === 'categories' && body.expenseType && 'expenseType' in item)
      item.expenseType = body.expenseType;
    return ok(item);
  }),

  http.post(`${API}/users`, async ({ request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchi yaratish huquqi yo‘q.');
    const body = (await request.json()) as {
      fullName?: string;
      phone?: string;
      role?: AuthenticatedUser['roles'][number]['role'];
      branchId?: string | null;
      cashierBranchId?: string | null;
    };
    if (!body.fullName?.trim() || !body.phone?.trim() || !body.role)
      return problem(422, 'VALIDATION_ERROR', 'Ism, telefon va rol majburiy.');
    if (body.role === 'director' && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor rolini faqat amaldagi direktor biriktirishi mumkin.',
      );
    if (userRows.some((item) => item.phone.replace(/\D/g, '') === body.phone!.replace(/\D/g, '')))
      return problem(409, 'DUPLICATE_REFERENCE', 'Bu telefon raqam allaqachon mavjud.');
    const cashierScopeId = body.role === 'cashier' ? body.branchId : body.cashierBranchId;
    const branch = cashierScopeId
      ? branches.find((item) => item.id === cashierScopeId && item.isActive)
      : null;
    if (body.role === 'cashier' && !branch)
      return problem(422, 'BRANCH_REQUIRED', 'Kassir uchun filial scope majburiy.');
    if (cashierScopeId && !branch)
      return problem(422, 'BRANCH_INVALID', 'Kassir filial scope’i topilmadi.');
    const assignedRoles: AuthenticatedUser['roles'] = [
      {
        id: `role-${Date.now()}`,
        role: body.role,
        roleName:
          body.role === 'cashier'
            ? 'Kassir'
            : body.role === 'director'
              ? 'Direktor'
              : 'Moliya rahbari',
        branchId: body.role === 'cashier' ? (branch?.id ?? null) : null,
        branchName: body.role === 'cashier' ? (branch?.name ?? null) : null,
      },
    ];
    if (body.role === 'finance_manager' && branch)
      assignedRoles.push({
        id: `role-cashier-${Date.now()}`,
        role: 'cashier',
        roleName: 'Kassir',
        branchId: branch.id,
        branchName: branch.name,
      });
    const created: AuthenticatedUser = {
      id: `user-${Date.now()}`,
      fullName: body.fullName.trim(),
      phone: body.phone.trim(),
      status: 'active',
      roles: assignedRoles,
      permissions: [
        ...new Set(assignedRoles.flatMap((assignment) => rolePermissionRows[assignment.role])),
      ],
      branchScopes:
        body.role === 'cashier' && branch ? [branch.id] : branches.map((item) => item.id),
      writeBranchScopes:
        body.role === 'director' ? branches.map((item) => item.id) : branch ? [branch.id] : [],
      lastLoginAt: null,
    };
    userRows = [...userRows, created];
    return ok(created, 201);
  }),
  http.put(`${API}/users/:id/access`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchi accessini boshqarish huquqi yo‘q.');
    const item = userRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    if (hasRole(item, 'director') && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor accessini faqat direktor boshqarishi mumkin.',
      );
    const body = (await request.json()) as Partial<UserAccessUpdateInput>;
    if (!Array.isArray(body.roles) || body.roles.length === 0)
      return problem(422, 'ROLE_REQUIRED', 'Kamida bitta rol biriktirilishi kerak.');
    const roleCodes = body.roles.map((assignment) => assignment.role);
    if (new Set(roleCodes).size !== roleCodes.length)
      return problem(409, 'DUPLICATE_ROLE', 'Bitta rol takroran biriktirilmaydi.');
    if (roleCodes.includes('director') && roleCodes.length > 1)
      return problem(422, 'ROLE_COMBINATION_INVALID', 'Direktor roli alohida access modeli.');
    if (roleCodes.includes('director') && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor rolini faqat amaldagi direktor biriktirishi mumkin.',
      );
    if (
      hasRole(item, 'director') &&
      !roleCodes.includes('director') &&
      item.status === 'active' &&
      userRows.filter(
        (candidate) => candidate.status === 'active' && hasRole(candidate, 'director'),
      ).length === 1
    )
      return problem(409, 'LAST_DIRECTOR_REQUIRED', 'Oxirgi faol direktor roli olib tashlanmaydi.');
    const invalidAssignment = body.roles.find((assignment) => {
      if (!['cashier', 'finance_manager', 'director'].includes(assignment.role)) return true;
      if (assignment.role !== 'cashier') return assignment.branchId !== null;
      return (
        !assignment.branchId ||
        !branches.some((branch) => branch.id === assignment.branchId && branch.isActive)
      );
    });
    if (invalidAssignment)
      return problem(
        422,
        'ROLE_SCOPE_INVALID',
        'Kassirga faol filial, markaz rollariga esa null filial scope berilishi kerak.',
      );
    const roles: AuthenticatedUser['roles'] = body.roles.map((assignment, index) => {
      const branch = assignment.branchId
        ? branches.find((candidate) => candidate.id === assignment.branchId)
        : null;
      return {
        id: `role-access-${item.id}-${index + 1}`,
        role: assignment.role,
        roleName:
          assignment.role === 'cashier'
            ? 'Kassir'
            : assignment.role === 'finance_manager'
              ? 'Moliya rahbari'
              : 'Direktor',
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? null,
      };
    });
    const centerRead = roles.some(
      (assignment) => assignment.role === 'director' || assignment.role === 'finance_manager',
    );
    const cashierBranches = [
      ...new Set(
        roles.flatMap((assignment) =>
          assignment.role === 'cashier' && assignment.branchId ? [assignment.branchId] : [],
        ),
      ),
    ];
    item.roles = roles;
    item.permissions = [
      ...new Set(roles.flatMap((assignment) => rolePermissionRows[assignment.role])),
    ];
    item.branchScopes = centerRead ? branches.map((branch) => branch.id) : cashierBranches;
    item.writeBranchScopes = roles.some((assignment) => assignment.role === 'director')
      ? branches.map((branch) => branch.id)
      : cashierBranches;
    if (signedInUser?.id === item.id) signedInUser = structuredClone(item);
    return ok(item);
  }),
  http.patch(`${API}/users/:id/status`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchini boshqarish huquqi yo‘q.');
    const item = userRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    if (hasRole(item, 'director') && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor statusini faqat direktor boshqarishi mumkin.',
      );
    const body = (await request.json()) as { status?: AuthenticatedUser['status'] };
    if (!body.status || !['active', 'inactive', 'blocked'].includes(body.status))
      return problem(
        422,
        'VALIDATION_ERROR',
        'Yangi status active, inactive yoki blocked bo‘lsin.',
      );
    if (
      item.status === 'active' &&
      body.status !== 'active' &&
      hasRole(item, 'director') &&
      userRows.filter(
        (candidate) => candidate.status === 'active' && hasRole(candidate, 'director'),
      ).length === 1
    )
      return problem(
        409,
        'LAST_DIRECTOR_REQUIRED',
        'Oxirgi faol direktor bloklanmaydi yoki nofaol qilinmaydi.',
      );
    item.status = body.status;
    return ok(item);
  }),
  http.get(`${API}/roles/permissions`, () => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'role.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Rollarni ko‘rish huquqi yo‘q.');
    return ok(rolePermissionRows);
  }),
  http.put(`${API}/roles/:role/permissions`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'role.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Rollarni boshqarish huquqi yo‘q.');
    if (!hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Rol ruxsatlarini faqat amaldagi direktor o‘zgartirishi mumkin.',
      );
    const body = (await request.json()) as { permissions?: AuthenticatedUser['permissions'] };
    if (!body.permissions) return problem(422, 'VALIDATION_ERROR', 'Ruxsatlar ro‘yxati majburiy.');
    const role = String(params.role) as AuthenticatedUser['roles'][number]['role'];
    if (!(role in rolePermissionRows)) return problem(404, 'ROLE_NOT_FOUND', 'Rol topilmadi.');
    rolePermissionRows[role] = [...new Set(body.permissions)];
    userRows.forEach((user) => {
      user.permissions = [
        ...new Set(user.roles.flatMap((assignment) => rolePermissionRows[assignment.role])),
      ];
    });
    if (signedInUser) {
      const refreshed = userRows.find((user) => user.id === signedInUser?.id);
      if (refreshed) signedInUser = structuredClone(refreshed);
    }
    return ok({ role, permissions: rolePermissionRows[role] });
  }),
  http.get(`${API}/reconciliations`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'import.run'))
      return problem(403, 'PERMISSION_DENIED', 'Reconciliationni ko‘rish huquqi yo‘q.');
    refreshOperationalState();
    return ok(reconciliationRows);
  }),
  http.get(`${API}/periods/:id/readiness`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'period.close', 'period.reopen'))
      return problem(403, 'PERMISSION_DENIED', 'Davr tayyorligini ko‘rish huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.id);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Davr topilmadi.');
    return ok(refreshOperationalState(period.id));
  }),
  http.post(`${API}/periods/:id/close`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'period.close'))
      return problem(403, 'PERMISSION_DENIED', 'Davrni yopish huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.id);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Davr topilmadi.');
    if (period.status === 'closed')
      return problem(409, 'PERIOD_ALREADY_CLOSED', 'Davr allaqachon yopilgan.');
    const readiness = refreshOperationalState(period.id);
    if (!readiness.canClose)
      return problem(409, 'PERIOD_NOT_READY', 'Bloklovchi tekshiruvlar bartaraf etilmagan.', {
        checks: readiness.checks.filter((check) => check.status === 'blocked'),
      });
    const body = (await request.json()) as { note?: string };
    if (!body.note?.trim() || body.note.trim().length < 8)
      return problem(422, 'REASON_REQUIRED', 'Yopish izohi kamida 8 ta belgi bo‘lishi kerak.');
    period.status = 'closed';
    period.closedAt = new Date().toISOString();
    period.closedByName = user.fullName;
    budgetRows
      .filter((budget) => budget.periodId === period.id && budget.status === 'approved')
      .forEach((budget) => {
        budget.status = 'locked';
      });
    revenuePlanRows
      .filter((plan) => plan.periodId === period.id && plan.status === 'approved')
      .forEach((plan) => {
        plan.status = 'locked';
      });
    const occurredAt = new Date().toISOString();
    const history = periodHistoryRows.get(period.id) ?? [];
    history.unshift({
      id: `ph-${Date.now()}`,
      action: 'closed',
      actorName: user.fullName,
      occurredAt,
      reason: body.note.trim(),
    });
    periodHistoryRows.set(period.id, history);
    const summary = branchDashboard(null, period.id);
    periodSnapshotRows.set(period.id, {
      id: `snapshot-${period.id}-${Date.now()}`,
      createdAt: occurredAt,
      createdByName: user.fullName,
      expenseActualUzs: summary.expenseActualUzs,
      revenueActualUzs: summary.revenueActualUzs,
      netResultUzs: summary.netResultUzs,
      reconciliationStatus: 'match',
      artifacts: ['Dashboard', 'Xarajatlar', 'Tushumlar', 'Reconciliation'],
    });
    auditRows.unshift({
      id: `audit-period-close-${Date.now()}`,
      occurredAt,
      actorId: user.id,
      actorName: user.fullName,
      action: 'period.closed',
      entityType: 'accounting_period',
      entityId: period.id,
      branchId: null,
      branchName: null,
      result: 'success',
      reason: body.note.trim(),
    });
    return ok(refreshOperationalState(period.id));
  }),
  http.post(`${API}/periods/:id/reopen`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'period.reopen'))
      return problem(403, 'PERMISSION_DENIED', 'Davrni qayta ochish huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.id);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Davr topilmadi.');
    if (period.status !== 'closed')
      return problem(409, 'PERIOD_ALREADY_OPEN', 'Davr allaqachon ochiq.');
    const body = (await request.json()) as { reason?: string };
    if (!body.reason?.trim())
      return problem(422, 'REASON_REQUIRED', 'Qayta ochish sababi majburiy.');
    period.status = 'open';
    period.closedAt = null;
    period.closedByName = null;
    const occurredAt = new Date().toISOString();
    const history = periodHistoryRows.get(period.id) ?? [];
    history.unshift({
      id: `ph-${Date.now()}`,
      action: 'reopened',
      actorName: user.fullName,
      occurredAt,
      reason: body.reason.trim(),
    });
    periodHistoryRows.set(period.id, history);
    auditRows.unshift({
      id: `audit-period-reopen-${Date.now()}`,
      occurredAt,
      actorId: user.id,
      actorName: user.fullName,
      action: 'period.reopened',
      entityType: 'accounting_period',
      entityId: period.id,
      branchId: null,
      branchName: null,
      result: 'success',
      reason: body.reason.trim(),
    });
    return ok(refreshOperationalState(period.id));
  }),
  http.get(`${API}/audit-logs`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'audit.view'))
      return problem(403, 'PERMISSION_DENIED', 'Audit logni ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const actor = url.searchParams.get('actor');
    const action = url.searchParams.get('action')?.toLocaleLowerCase('uz') ?? '';
    const entityType = url.searchParams.get('entityType');
    const branch = url.searchParams.get('branch');
    const result = url.searchParams.get('result');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const search = url.searchParams.get('search')?.toLocaleLowerCase('uz') ?? '';
    const filtered = auditRows
      .filter((row) => !row.branchId || canUseBranch(user, row.branchId))
      .filter((row) => !actor || actor === 'all' || row.actorId === actor)
      .filter((row) => !action || row.action.toLocaleLowerCase('uz').includes(action))
      .filter((row) => !entityType || entityType === 'all' || row.entityType === entityType)
      .filter((row) => !branch || branch === 'all' || row.branchId === branch)
      .filter((row) => !result || result === 'all' || row.result === result)
      .filter((row) => !dateFrom || row.occurredAt.slice(0, 10) >= dateFrom)
      .filter((row) => !dateTo || row.occurredAt.slice(0, 10) <= dateTo)
      .filter(
        (row) =>
          !search ||
          `${row.action} ${row.entityType} ${row.entityId} ${row.actorName} ${row.reason ?? ''}`
            .toLocaleLowerCase('uz')
            .includes(search),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return ok(paginate(filtered, request));
  }),
];

export function resetMockState(): void {
  signedInUser = null;
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(MOCK_SESSION_KEY);
  expenseRows = structuredClone(expenses);
  revenueRows = structuredClone(revenueTransactions);
  periodRows = structuredClone(periods);
  budgetRows = [structuredClone(budgetHistoricalVersion), structuredClone(budgetVersion)];
  revenuePlanRows = structuredClone(revenuePlans);
  periodHistoryRows = new Map([
    [ids.periodJul, structuredClone(closeReadiness.history)],
    [ids.periodAug, []],
  ]);
  periodSnapshotRows = new Map([
    [
      ids.periodJul,
      {
        id: 'snapshot-2026-07',
        createdAt: periods[1]?.closedAt ?? '2026-08-03T09:12:00+05:00',
        createdByName: periods[1]?.closedByName ?? 'Shohrux Ermanov',
        expenseActualUzs: '0',
        revenueActualUzs: '0',
        netResultUzs: '0',
        reconciliationStatus: 'match',
        artifacts: ['Dashboard', 'Xarajatlar', 'Tushumlar', 'Reconciliation'],
      },
    ],
  ]);
  categoryRows = structuredClone(categories);
  departmentRows = structuredClone(departments);
  paymentMethodRows = structuredClone(paymentMethods);
  userRows = structuredClone(users);
  dqRows = structuredClone(dqExceptions);
  auditRows = structuredClone(auditEvents);
  rolePermissionRows = {
    cashier: structuredClone(users[2]!.permissions),
    finance_manager: structuredClone(users[1]!.permissions),
    director: structuredClone(users[0]!.permissions),
  };
  reconciliationRows = structuredClone(reconciliations);
  importJob = {
    id: 'import-xalqlar-date-normalization',
    sourceName: 'Xalqlar_kassa',
    status: 'preview_ready',
    totalRows: 44,
    normalizedRows: 0,
    exceptionRows: 43,
    recoveredAmountUzs: '0',
    startedAt: null,
    completedAt: null,
    message: '43 ta text-date satri previewda aniqlandi; hech biri jim tashlab ketilmaydi.',
  };
  legacyImportedLedgerRows = [];
  expenseIdempotency.clear();
  revenueIdempotency.clear();
}
