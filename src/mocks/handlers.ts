import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import type {
  AccountingPeriod,
  AnnualExpenseSummary,
  AuthenticatedUser,
  BudgetPlan,
  DailyRevenue,
  DailyRevenueInput,
  Expense,
  ExpenseCreateInput,
  MoneyUzs,
  PaginatedResponse,
  RevenuePlanBoard,
  TelegramSettings,
  TelegramSettingsInput,
  TrendGranularity,
  TrendPoint,
  UserDirectoryItem,
  UserAccessUpdateInput,
} from '@/shared/types/domain';
import {
  branches,
  budgetPlans,
  categories,
  dailyRevenues,
  departments,
  expenses,
  historicalMonthly,
  ids,
  paymentMethods,
  periods,
  revenuePlanSeedUzs,
  users,
} from './fixtures';
import {
  buildMonthlyReportMessage,
  buildReminderMessage,
  findMissingRevenueBranches,
} from '@/features/notifications/telegram';
import { buildCashierReport } from '@/features/reports/cashier-report';

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
const periodRows = structuredClone(periods);
let budgetPlanRows: BudgetPlan[] = structuredClone(budgetPlans);
let revenueRows = structuredClone(dailyRevenues);
const revenuePlanRows: Record<string, Record<string, MoneyUzs>> =
  structuredClone(revenuePlanSeedUzs);
const revenuePlanMeta = new Map<string, { updatedAt: string; updatedByName: string }>();
let categoryRows = structuredClone(categories);
let departmentRows = structuredClone(departments);
let paymentMethodRows = structuredClone(paymentMethods);
let userRows = structuredClone(users);
const rolePermissionRows: Record<
  AuthenticatedUser['roles'][number]['role'],
  AuthenticatedUser['permissions']
> = {
  cashier: structuredClone(users[2]!.permissions),
  finance_manager: structuredClone(users[1]!.permissions),
  director: structuredClone(users[0]!.permissions),
};
const expenseIdempotency = new Map<string, Expense>();
const revenueIdempotency = new Map<string, DailyRevenue>();

/** Bot token faqat serverda qoladi — GET javobida hech qachon qaytarilmaydi. */
let telegramState: TelegramSettings & { botToken: string | null } = {
  enabled: false,
  botTokenSet: false,
  botToken: null,
  dailyReminderEnabled: true,
  reminderTimeLocal: '20:00',
  monthlyReportEnabled: true,
  monthlyReportDay: 1,
  recipients: [],
};

function publicTelegramSettings(): TelegramSettings {
  const { botToken, ...rest } = telegramState;
  return { ...rest, botTokenSet: Boolean(botToken) };
}

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

function sumMoney(values: MoneyUzs[]): MoneyUzs {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
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

function buildBudgetPlan(periodId: string): BudgetPlan {
  const existing = budgetPlanRows.find((row) => row.periodId === periodId);
  const period = periodRows.find((row) => row.id === periodId);
  const lines = categoryRows
    .filter((category) => category.isActive)
    .flatMap((category) =>
      branches.map((branch) => {
        const savedLine = existing?.lines.find(
          (line) => line.branchId === branch.id && line.categoryId === category.id,
        );
        const actualAmountUzs = sumMoney(
          expenseRows
            .filter(
              (expense) =>
                expense.periodId === periodId &&
                expense.branchId === branch.id &&
                expense.categoryId === category.id,
            )
            .map((expense) => expense.amountUzs),
        );
        const plannedAmountUzs = savedLine?.plannedAmountUzs ?? null;
        const hasPlan = plannedAmountUzs !== null;
        return {
          id: savedLine?.id ?? `bl-${category.code}-${branch.code}`,
          branchId: branch.id,
          branchName: branch.name,
          categoryId: category.id,
          categoryCodeSnapshot: category.code,
          categoryNameSnapshot: category.name,
          expenseTypeSnapshot: category.expenseType,
          plannedAmountUzs,
          actualAmountUzs,
          varianceUzs: hasPlan
            ? (BigInt(plannedAmountUzs) - BigInt(actualAmountUzs)).toString()
            : null,
          hasPlan,
        };
      }),
    );
  return {
    id: existing?.id ?? `budget-${periodId}`,
    periodId,
    periodLabel: period?.label ?? existing?.periodLabel ?? periodId,
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
    updatedByName: existing?.updatedByName ?? '—',
    lines,
  };
}

const monthShortNames = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyun',
  'Iyul',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Oylik summani kunlarga qoldiqsiz bo‘ladi: bo‘laklar yig‘indisi aynan oylik summaga teng. */
function distributeDaily(monthly: bigint, days: number): bigint[] {
  const total = BigInt(days);
  return Array.from(
    { length: days },
    (_, index) =>
      (monthly * BigInt(index + 1)) / total - (monthly * BigInt(index)) / total,
  );
}

function revenuePlanFor(periodId: string, branchId: string): MoneyUzs | null {
  return revenuePlanRows[periodId]?.[branchId] ?? null;
}

function monthlyRevenuePlanUzs(periodId: string, branchIds: Set<string>): MoneyUzs {
  return sumMoney([...branchIds].map((branchId) => revenuePlanFor(periodId, branchId) ?? '0'));
}

function monthlyRevenueActualUzs(periodId: string, branchIds: Set<string>): MoneyUzs {
  return sumMoney(
    revenueRows
      .filter((row) => row.periodId === periodId && branchIds.has(row.branchId))
      .map((row) => row.totalUzs),
  );
}

function monthlyExpensePlanUzs(periodId: string, branchIds: Set<string>): MoneyUzs {
  return sumMoney(
    buildBudgetPlan(periodId)
      .lines.filter((line) => branchIds.has(line.branchId) && line.hasPlan)
      .map((line) => line.plannedAmountUzs ?? '0'),
  );
}

function monthlyExpenseActualUzs(periodId: string, branchIds: Set<string>): MoneyUzs {
  return sumMoney(
    expenseRows
      .filter((row) => row.periodId === periodId && branchIds.has(row.branchId))
      .map((row) => row.amountUzs),
  );
}

function buildRevenuePlanBoard(periodId: string): RevenuePlanBoard {
  const period = periodRows.find((row) => row.id === periodId);
  const days = period ? daysInMonth(period.year, period.month) : 30;
  const meta = revenuePlanMeta.get(periodId);
  return {
    id: `revenue-plan-${periodId}`,
    periodId,
    periodLabel: period?.label ?? periodId,
    daysInMonth: days,
    updatedAt: meta?.updatedAt ?? '2026-08-01T09:00:00+05:00',
    updatedByName: meta?.updatedByName ?? 'Madina Karimova',
    lines: branches.map((branch) => {
      const plannedAmountUzs = revenuePlanFor(periodId, branch.id);
      const actualAmountUzs = monthlyRevenueActualUzs(periodId, new Set([branch.id]));
      const hasPlan = plannedAmountUzs !== null;
      return {
        id: `rp-${periodId}-${branch.code}`,
        branchId: branch.id,
        branchName: branch.name,
        plannedAmountUzs,
        actualAmountUzs,
        varianceUzs: hasPlan
          ? (BigInt(plannedAmountUzs) - BigInt(actualAmountUzs)).toString()
          : null,
        completionPercent: hasPlan ? percentageValue(actualAmountUzs, plannedAmountUzs) : null,
        hasPlan,
        dailyPlanUzs: hasPlan ? (BigInt(plannedAmountUzs) / BigInt(days)).toString() : null,
      };
    }),
  };
}

/** Tanlangan filial(lar)ning umumiy rejadagi ulushi — tarixiy oylarni masshtablash uchun. */
function branchSharePercent(branchIds: Set<string>, kind: 'revenue' | 'expense'): bigint {
  const all = new Set(branches.map((branch) => branch.id));
  const totalUzs =
    kind === 'revenue'
      ? monthlyRevenuePlanUzs(ids.periodAug, all)
      : monthlyExpensePlanUzs(ids.periodAug, all);
  const selectedUzs =
    kind === 'revenue'
      ? monthlyRevenuePlanUzs(ids.periodAug, branchIds)
      : monthlyExpensePlanUzs(ids.periodAug, branchIds);
  if (BigInt(totalUzs) === 0n) return 100n;
  return (BigInt(selectedUzs) * 100n) / BigInt(totalUzs);
}

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
      const monthPeriod = periodRows.find(
        (row) => row.year === period.year && row.month === month,
      );
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
      revenueActual: revenueRows
        .filter((row) => row.businessDate === date && branchIds.has(row.branchId))
        .reduce((total, row) => total + BigInt(row.totalUzs), 0n),
      expensePlan: expensePlanDaily[index] ?? 0n,
      expenseActual: expenseRows
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
    expenseRows
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
    peakMonth: peak
      ? { month: peak.month, label: peak.label, actualUzs: peak.actualUzs }
      : null,
    months,
  };
}

function buildDashboard(
  branchId: string | null,
  periodId: string,
  granularity: TrendGranularity,
) {
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
    expenseRows
      .filter(
        (row) =>
          row.periodId === periodId &&
          selectedBranchIds.has(row.branchId) &&
          row.expenseTypeSnapshot === 'fixed',
      )
      .map((row) => row.amountUzs),
  );
  const variableExpenseUzs = sumMoney(
    expenseRows
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
    branches: branchMetrics,
  };
}

function filterExpenses(request: Request, user: AuthenticatedUser): Expense[] {
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
  const filtered = expenseRows
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
    const requestedGranularity = url.searchParams.get('granularity');
    const granularity: TrendGranularity =
      requestedGranularity === 'daily' || requestedGranularity === 'weekly'
        ? requestedGranularity
        : 'monthly';
    return ok(buildDashboard(branchId, periodId, granularity));
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
      sourceSheet: null,
      sourceRow: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

  http.get(`${API}/budget-plans/:periodId`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.view'))
      return problem(403, 'PERMISSION_DENIED', 'Budjetni ko‘rish huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    return ok(buildBudgetPlan(String(params.periodId)));
  }),
  http.put(`${API}/budget-plans/:periodId/lines`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Budjetni tahrirlash huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    if (period.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi budjet tahrirlanmaydi.');
    const body = (await request.json()) as {
      lines: Array<Pick<BudgetPlan['lines'][number], 'branchId' | 'categoryId' | 'plannedAmountUzs'>>;
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
    const current = buildBudgetPlan(String(params.periodId));
    const updatedLines = current.lines.map((line) => {
      const input = body.lines.find(
        (candidate) => candidate.branchId === line.branchId && candidate.categoryId === line.categoryId,
      );
      if (!input) return line;
      const hasPlan = input.plannedAmountUzs !== null;
      return {
        ...line,
        plannedAmountUzs: input.plannedAmountUzs,
        hasPlan,
        varianceUzs: hasPlan
          ? (BigInt(input.plannedAmountUzs!) - BigInt(line.actualAmountUzs)).toString()
          : null,
      };
    });
    const saved: BudgetPlan = {
      id: current.id,
      periodId: current.periodId,
      periodLabel: current.periodLabel,
      updatedAt: new Date().toISOString(),
      updatedByName: user.fullName,
      lines: updatedLines,
    };
    budgetPlanRows = [...budgetPlanRows.filter((row) => row.periodId !== params.periodId), saved];
    return ok(saved);
  }),

  http.get(`${API}/daily-revenues`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue.view_own_branch', 'revenue.view_all_branches'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumlarni ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const branch = url.searchParams.get('branch');
    const periodId = url.searchParams.get('periodId');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const sort = url.searchParams.get('sort') ?? 'businessDate:desc';
    const direction = sort.endsWith(':asc') ? 1 : -1;
    const rows = revenueRows
      .filter(
        (row) =>
          hasPermission(user, 'revenue.view_all_branches') || canUseBranch(user, row.branchId),
      )
      .filter((row) => !branch || branch === 'all' || row.branchId === branch)
      .filter((row) => !periodId || row.periodId === periodId)
      .filter((row) => !dateFrom || row.businessDate >= dateFrom)
      .filter((row) => !dateTo || row.businessDate <= dateTo)
      .sort(
        (a, b) =>
          direction *
          (a.businessDate.localeCompare(b.businessDate) || a.branchName.localeCompare(b.branchName)),
      );
    return ok(paginate(rows, request));
  }),
  http.get(`${API}/daily-revenues/:id`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue.view_own_branch', 'revenue.view_all_branches'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumni ko‘rish huquqi yo‘q.');
    const item = revenueRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');
    if (!hasPermission(user, 'revenue.view_all_branches') && !canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    return ok(item);
  }),
  http.post(`${API}/daily-revenues`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue.create'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum kiritish huquqi yo‘q.');
    const body = (await request.json()) as DailyRevenueInput;
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
    const channels = [body.cashUzs, body.cardUzs, body.transferUzs];
    if (channels.some((value) => !isNonNegativeMoney(value)))
      return problem(422, 'AMOUNT_INVALID', 'Summalar manfiy bo‘lmagan butun so‘mda bo‘lsin.');
    const totalUzs = sumMoney(channels);
    if (BigInt(totalUzs) <= 0n)
      return problem(422, 'AMOUNT_INVALID', 'Kunlik jami tushum 0 dan katta bo‘lishi kerak.');
    const period = findPeriodForBusinessDate(body.businessDate);
    if (!period)
      return problem(
        422,
        'DATE_OR_PERIOD_INVALID',
        'Sana haqiqiy va mavjud hisob davriga tegishli bo‘lishi kerak.',
      );
    if (period.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrga tushum kiritib bo‘lmaydi.');
    const duplicate = revenueRows.find(
      (row) => row.businessDate === body.businessDate && row.branchId === branchId,
    );
    if (duplicate)
      return problem(
        409,
        'REVENUE_DAY_EXISTS',
        'Bu kun uchun ushbu filialda tushum allaqachon kiritilgan. Mavjud yozuvni tahrirlang.',
        { revenueId: duplicate.id },
      );
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return problem(422, 'REFERENCE_INVALID', 'Filial topilmadi.');
    const now = new Date().toISOString();
    const created: DailyRevenue = {
      id: `rev-mock-${revenueRows.length + 1}`,
      businessDate: body.businessDate,
      periodId: period.id,
      branchId,
      branchName: branch.name,
      cashUzs: body.cashUzs,
      cardUzs: body.cardUzs,
      transferUzs: body.transferUzs,
      totalUzs,
      comment: body.comment?.trim() || null,
      enteredBy: user.id,
      enteredByName: user.fullName,
      createdAt: now,
      updatedAt: now,
    };
    revenueRows = [created, ...revenueRows];
    revenueIdempotency.set(dedupeKey, structuredClone(created));
    return ok(created, 201);
  }),
  http.patch(`${API}/daily-revenues/:id`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue.edit', 'revenue.create'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumni tahrirlash huquqi yo‘q.');
    const index = revenueRows.findIndex((row) => row.id === params.id);
    const old = revenueRows[index];
    if (!old) return problem(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');
    if (!canWriteBranch(user, old.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    if (periodRows.find((row) => row.id === old.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrdagi tushum tahrirlanmaydi.');
    const body = (await request.json()) as Partial<DailyRevenueInput>;
    const cashUzs = body.cashUzs ?? old.cashUzs;
    const cardUzs = body.cardUzs ?? old.cardUzs;
    const transferUzs = body.transferUzs ?? old.transferUzs;
    if ([cashUzs, cardUzs, transferUzs].some((value) => !isNonNegativeMoney(value)))
      return problem(422, 'AMOUNT_INVALID', 'Summalar manfiy bo‘lmagan butun so‘mda bo‘lsin.');
    const totalUzs = sumMoney([cashUzs, cardUzs, transferUzs]);
    if (BigInt(totalUzs) <= 0n)
      return problem(422, 'AMOUNT_INVALID', 'Kunlik jami tushum 0 dan katta bo‘lishi kerak.');
    const updated: DailyRevenue = {
      ...old,
      cashUzs,
      cardUzs,
      transferUzs,
      totalUzs,
      comment: body.comment?.trim() || old.comment,
      updatedAt: new Date().toISOString(),
    };
    revenueRows[index] = updated;
    return ok(updated);
  }),

  http.get(`${API}/revenue-plans/:periodId`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue_plan.manage', 'reports.view'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejasini ko‘rish huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    return ok(buildRevenuePlanBoard(String(params.periodId)));
  }),
  http.put(`${API}/revenue-plans/:periodId`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejasini tahrirlash huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    if (period.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi tushum rejasi tahrirlanmaydi.');
    const body = (await request.json()) as {
      lines: Array<{ branchId: string; plannedAmountUzs: MoneyUzs | null }>;
    };
    if (
      !Array.isArray(body.lines) ||
      body.lines.some(
        (line) => line.plannedAmountUzs !== null && !isNonNegativeMoney(line.plannedAmountUzs),
      )
    )
      return problem(
        422,
        'REVENUE_PLAN_INVALID',
        'Reja qiymati null yoki manfiy bo‘lmagan butun so‘m bo‘lishi kerak.',
      );
    const periodId = String(params.periodId);
    const next: Record<string, MoneyUzs> = {};
    for (const line of body.lines) {
      if (!branches.some((branch) => branch.id === line.branchId))
        return problem(422, 'REFERENCE_INVALID', 'Filial topilmadi.');
      if (line.plannedAmountUzs !== null) next[line.branchId] = line.plannedAmountUzs;
    }
    revenuePlanRows[periodId] = next;
    revenuePlanMeta.set(periodId, {
      updatedAt: new Date().toISOString(),
      updatedByName: user.fullName,
    });
    return ok(buildRevenuePlanBoard(periodId));
  }),

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
        users: userRows,
        revenues: revenueRows,
        branchPlanUzs: Object.fromEntries(
          branches.map((branch) => [branch.id, revenuePlanFor(periodId, branch.id) ?? '0']),
        ),
        // Ruxsati cheklangan kassir faqat o‘z qatorini oladi.
        ...(seesEveryone ? {} : { viewerId: user.id }),
      }),
    );
  }),
  http.patch(`${API}/users/:id/salary`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Oylikni o‘zgartirish huquqi yo‘q.');
    const item = userRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    const body = (await request.json()) as { fixedSalaryUzs?: string };
    if (!isNonNegativeMoney(body.fixedSalaryUzs))
      return problem(422, 'AMOUNT_INVALID', 'Oylik manfiy bo‘lmagan butun so‘m bo‘lishi kerak.');
    item.fixedSalaryUzs = body.fixedSalaryUzs;
    if (signedInUser?.id === item.id) signedInUser = structuredClone(item);
    return ok(item);
  }),

  http.get(`${API}/notifications/telegram`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Bildirishnoma sozlamalari uchun ruxsat yo‘q.');
    return ok(publicTelegramSettings());
  }),
  http.put(`${API}/notifications/telegram`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Bildirishnoma sozlamalari uchun ruxsat yo‘q.');
    const body = (await request.json()) as TelegramSettingsInput;
    if (!/^\d{2}:\d{2}$/.test(body.reminderTimeLocal ?? ''))
      return problem(422, 'TIME_INVALID', 'Eslatma vaqti HH:mm formatida bo‘lsin.');
    if (!Number.isInteger(body.monthlyReportDay) || body.monthlyReportDay < 1 || body.monthlyReportDay > 28)
      return problem(422, 'DAY_INVALID', 'Hisobot kuni 1 va 28 orasida bo‘lsin.');
    if (body.enabled && !body.botToken && !telegramState.botToken)
      return problem(422, 'BOT_TOKEN_REQUIRED', 'Bot tokeni kiritilmagan.');
    telegramState = {
      ...telegramState,
      enabled: body.enabled,
      dailyReminderEnabled: body.dailyReminderEnabled,
      reminderTimeLocal: body.reminderTimeLocal,
      monthlyReportEnabled: body.monthlyReportEnabled,
      monthlyReportDay: body.monthlyReportDay,
      recipients: (body.recipients ?? []).map((item) => ({
        userId: item.userId,
        fullName: item.fullName,
        chatId: String(item.chatId ?? '').trim(),
      })),
      ...(body.botToken ? { botToken: body.botToken } : {}),
    };
    return ok(publicTelegramSettings());
  }),
  http.get(`${API}/notifications/reminder-preview`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Ruxsat yo‘q.');
    const businessDate =
      new URL(request.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    const states = findMissingRevenueBranches(branches, revenueRows, businessDate);
    return ok({
      businessDate,
      branches: states.map((state) => {
        const recipients = telegramState.recipients.filter((recipient) => {
          const target = userRows.find((row) => row.id === recipient.userId);
          return (
            Boolean(recipient.chatId) &&
            target?.status === 'active' &&
            target.writeBranchScopes.includes(state.branchId)
          );
        });
        return {
          ...state,
          recipients,
          message:
            state.totalUzs === null
              ? buildReminderMessage({
                  branchName: state.branchName,
                  businessDate,
                  ...(recipients[0] ? { cashierName: recipients[0].fullName } : {}),
                })
              : null,
        };
      }),
    });
  }),
  http.get(`${API}/notifications/monthly-preview`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Ruxsat yo‘q.');
    const periodId = new URL(request.url).searchParams.get('period') ?? ids.periodAug;
    const period = periodRows.find((row) => row.id === periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    const data = buildDashboard(null, periodId, 'monthly');
    return ok({
      periodLabel: period.label,
      message: buildMonthlyReportMessage({
        periodLabel: period.label,
        revenuePlanUzs: data.revenuePlanUzs,
        revenueActualUzs: data.revenueActualUzs,
        revenueCompletionPct: data.revenueCompletionPct,
        expensePlanUzs: data.expensePlanUzs,
        expenseActualUzs: data.expenseActualUzs,
        expenseCompletionPct: data.expenseCompletionPct,
        fixedExpenseUzs: data.fixedExpenseUzs,
        variableExpenseUzs: data.variableExpenseUzs,
        branches: data.branches.map((branch) => ({
          name: branch.name,
          revenueActualUzs: branch.revenueActualUzs,
          revenueCompletionPct: branch.revenueCompletionPct,
          expenseActualUzs: branch.expenseActualUzs,
          expenseCompletionPct: branch.expenseCompletionPct,
        })),
      }),
      recipients: telegramState.recipients.filter((recipient) => {
        const target = userRows.find((row) => row.id === recipient.userId);
        return Boolean(recipient.chatId) && target?.permissions.includes('reports.view');
      }),
    });
  }),
  http.post(`${API}/notifications/telegram/test`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Ruxsat yo‘q.');
    if (!telegramState.botToken)
      return problem(422, 'BOT_TOKEN_REQUIRED', 'Avval bot tokenini saqlang.');
    const body = (await request.json()) as { chatId?: string };
    const chatId = String(body.chatId ?? '').trim();
    if (!/^-?\d{5,}$/.test(chatId))
      return problem(422, 'CHAT_ID_INVALID', 'Chat ID raqamlardan iborat bo‘lishi kerak.');
    // Demo muhitda haqiqiy yuborish yo‘q — backend qo‘shilgach shu joyda
    // Telegram Bot API chaqiriladi.
    return ok({ delivered: false, chatId, note: 'DEMO_NO_BACKEND' });
  }),

  http.post(`${API}/imports/expenses`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'import.run'))
      return problem(403, 'PERMISSION_DENIED', 'Import qilish huquqi yo‘q.');
    const body = (await request.json()) as {
      rows?: Array<{
        sourceSheet: string;
        sourceRow: number;
        transactionDate: string;
        branchId: string;
        categoryId: string;
        description: string;
        amountUzs: MoneyUzs;
        paymentMethodId: string;
        departmentId: string;
        responsibleUserId: string;
        comment: string | null;
      }>;
    };
    if (!Array.isArray(body.rows) || body.rows.length === 0)
      return problem(422, 'IMPORT_EMPTY', 'Import uchun yozuv yo‘q.');

    let imported = 0;
    let skipped = 0;
    const rejected: Array<{ sourceSheet: string; sourceRow: number; message: string }> = [];
    const created: Expense[] = [];

    for (const input of body.rows) {
      const reject = (message: string) => {
        rejected.push({ sourceSheet: input.sourceSheet, sourceRow: input.sourceRow, message });
      };
      // Takroriy importni to‘xtatish — manba varaq + qator noyob kalit.
      if (
        expenseRows.some(
          (row) => row.sourceSheet === input.sourceSheet && row.sourceRow === input.sourceRow,
        )
      ) {
        skipped += 1;
        continue;
      }
      if (!isPositiveMoney(input.amountUzs)) {
        reject('Summa musbat butun so‘m bo‘lishi kerak.');
        continue;
      }
      const period = findPeriodForBusinessDate(input.transactionDate);
      if (!period) {
        reject('Sana mavjud hisob davriga tegishli emas.');
        continue;
      }
      if (period.status === 'closed') {
        reject(`${period.label} yopilgan — yozuv import qilinmadi.`);
        continue;
      }
      const branch = branches.find((item) => item.id === input.branchId);
      const category = categoryRows.find((item) => item.id === input.categoryId);
      const method = paymentMethodRows.find((item) => item.id === input.paymentMethodId);
      const department = departmentRows.find((item) => item.id === input.departmentId);
      const responsible = userRows.find((item) => item.id === input.responsibleUserId);
      if (!branch || !category || !method || !department || !responsible) {
        reject('Ma’lumotnomalardan biri topilmadi.');
        continue;
      }
      if (!canWriteBranch(user, branch.id)) {
        reject(`${branch.name} filialiga yozish huquqi yo‘q.`);
        continue;
      }
      const now = new Date().toISOString();
      const expense: Expense = {
        id: `exp-import-${input.sourceSheet}-${input.sourceRow}`,
        transactionDate: input.transactionDate,
        periodId: period.id,
        branchId: branch.id,
        branchName: branch.name,
        categoryId: category.id,
        categoryCodeSnapshot: category.code,
        categoryNameSnapshot: category.name,
        expenseTypeSnapshot: category.expenseType,
        description: input.description,
        amountUzs: input.amountUzs,
        paymentMethodId: method.id,
        paymentMethodName: method.name,
        departmentId: department.id,
        departmentName: department.name,
        responsibleUserId: responsible.id,
        responsibleUserName: responsible.fullName,
        enteredBy: user.id,
        enteredByName: user.fullName,
        comment: input.comment,
        sourceSheet: input.sourceSheet,
        sourceRow: input.sourceRow,
        createdAt: now,
        updatedAt: now,
      };
      created.push(expense);
      imported += 1;
    }

    expenseRows = [...created, ...expenseRows];
    return ok({
      imported,
      skipped,
      rejected,
      totalUzs: sumMoney(created.map((row) => row.amountUzs)),
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
    budgetPlanRows.forEach((plan) => {
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
        const planLines =
          period
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
          ? expenseRows.filter(
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
    const branchSummary = (branchId: string, plannedExpense: string, actualExpense: string) => {
      const branch = branches.find((item) => item.id === branchId)!;
      return {
        branch: { id: branch.id, code: branch.code, name: branch.name, snapshotName: branch.name },
        expense: planActual(plannedExpense, actualExpense),
      };
    };
    const totalSummary = (plannedExpense: string, actualExpense: string) => ({
      branch: { id: 'all', code: 'ALL', name: 'Markaz jami', snapshotName: 'Markaz jami' },
      expense: planActual(plannedExpense, actualExpense),
    });
    const requestedYear = Number(new URL(request.url).searchParams.get('year') || 2026);
    if (requestedYear !== 2026)
      return ok({
        year: requestedYear,
        months: [],
        annual: { branches: [], total: totalSummary('0', '0') },
      });
    const months = Array.from({ length: 12 }, (_, index) => {
      const active = index <= 7;
      const sayxun = branchSummary(
        ids.sayxun,
        '80000000',
        active ? String(52_000_000 + index * 2_500_000) : '0',
      );
      const xalqlar = branchSummary(
        ids.xalqlar,
        '45000000',
        active ? String(28_000_000 + index * 1_700_000) : '0',
      );
      const visible = [sayxun, xalqlar].filter((item) => canUseBranch(user, item.branch.id));
      const totalExpensePlan = sumMoney(
        visible.map((item) => item.expense.plannedAmountUzs ?? '0'),
      );
      const totalExpenseActual = sumMoney(visible.map((item) => item.expense.actualAmountUzs));
      return {
        month: index + 1,
        branches: visible,
        total: totalSummary(totalExpensePlan, active ? totalExpenseActual : '0'),
      };
    });
    const annualBranches = [
      branchSummary(ids.sayxun, '640000000', '560000000'),
      branchSummary(ids.xalqlar, '360000000', '320000000'),
    ].filter((item) => canUseBranch(user, item.branch.id));
    const annualExpensePlan = sumMoney(
      annualBranches.map((item) => item.expense.plannedAmountUzs ?? '0'),
    );
    const annualExpenseActual = sumMoney(
      annualBranches.map((item) => item.expense.actualAmountUzs),
    );
    return ok({
      year: requestedYear,
      months,
      annual: {
        branches: annualBranches,
        total: totalSummary(annualExpensePlan, annualExpenseActual),
      },
    });
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
      fixedSalaryUzs: '0',
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
];
