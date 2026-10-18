import type {
  AuthenticatedUser,
  BudgetPlan,
  DailyRevenue,
  Expense,
  ExpenseCategory,
  MasterItem,
  MoneyUzs,
  TelegramSettings,
  TelegramLinkStatus,
} from '@/shared/types/domain';
import {
  budgetPlans,
  categories,
  dailyRevenues,
  departments,
  expenses,
  paymentMethods,
  periods,
  revenuePlanSeedUzs,
  users,
} from './fixtures';

export const API = '*/api';

export const LATENCY_MS = 180;

export const MOCK_SESSION_KEY = 'fincore.mock.user';

function storedMockUser(): AuthenticatedUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = window.sessionStorage.getItem(MOCK_SESSION_KEY);
    return id ? structuredClone(users.find((user) => user.id === id) ?? null) : null;
  } catch {
    return null;
  }
}

/** Everything the mock API changes as requests come in. */
interface MockDb {
  signedInUser: AuthenticatedUser | null;
  expenseRows: Expense[];
  budgetPlanRows: BudgetPlan[];
  revenueRows: DailyRevenue[];
  categoryRows: ExpenseCategory[];
  departmentRows: MasterItem[];
  paymentMethodRows: MasterItem[];
  userRows: AuthenticatedUser[];
  telegramState: TelegramSettings;
  telegramLink: TelegramLinkStatus;
}

export const db: MockDb = {
  signedInUser: storedMockUser(),
  expenseRows: structuredClone(expenses),
  budgetPlanRows: structuredClone(budgetPlans),
  revenueRows: structuredClone(dailyRevenues),
  categoryRows: structuredClone(categories),
  departmentRows: structuredClone(departments),
  paymentMethodRows: structuredClone(paymentMethods),
  userRows: structuredClone(users),
  /** Bot token faqat serverda qoladi — GET javobida hech qachon qaytarilmaydi. */
  // PHASE 38: the bot token is deployment configuration, not something the mock
  // (or any client) can hold. botTokenSet mirrors the backend's env-derived flag.
  telegramState: {
    enabled: false,
    botTokenSet: true,
    dailyReminderEnabled: true,
    reminderTimeLocal: '20:00',
    monthlyReportEnabled: true,
    monthlyReportDay: 1,
    recipients: [],
  },
  /** Self-service link state for the signed-in demo user. */
  telegramLink: {
    status: 'unlinked',
    telegramUsername: null,
    displayName: null,
    linkedAt: null,
    pendingExpiresAt: null,
  },
};

export const periodRows = structuredClone(periods);

export const revenuePlanRows: Record<string, Record<string, MoneyUzs>> = structuredClone(
  revenuePlanSeedUzs,
);

export const revenuePlanMeta = new Map<string, { updatedAt: string; updatedByName: string }>();

export const rolePermissionRows: Record<
  AuthenticatedUser['roles'][number]['role'],
  AuthenticatedUser['permissions']
> = {
  cashier: structuredClone(users[2]!.permissions),
  finance_manager: structuredClone(users[1]!.permissions),
  director: structuredClone(users[0]!.permissions),
  // The investor role holds exactly one capability and inherits nothing else.
  investor: ['investor.view_own'],
  // Strategic owner: company-wide read surfaces only. No mutation capability.
  business_owner: [
    'dashboard.view',
    'expense.view_own_branch',
    'expense.view_all_branches',
    'budget.view',
    'revenue.view_own_branch',
    'revenue.view_all_branches',
    'reports.view',
    'investor.view_all',
    'audit.view',
  ],
};

export const expenseIdempotency = new Map<string, Expense>();

export const revenueIdempotency = new Map<string, DailyRevenue>();
