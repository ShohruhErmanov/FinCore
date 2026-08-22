export type UUID = string;
export type MoneyUzs = string;
export type IsoDate = string;
export type IsoDateTime = string;

export type PermissionCode =
  | 'dashboard.view'
  | 'expense.view_own_branch'
  | 'expense.view_all_branches'
  | 'expense.create'
  | 'expense.edit'
  | 'budget.view'
  | 'budget.create_edit'
  | 'revenue.view_own_branch'
  | 'revenue.view_all_branches'
  | 'revenue.create'
  | 'revenue.edit'
  | 'revenue_plan.manage'
  | 'import.run'
  | 'notification.manage'
  | 'reports.view_cashiers'
  | 'reports.view_own_performance'
  | 'reports.view'
  | 'master_data.manage'
  | 'user.manage'
  | 'role.manage';

export type RoleCode = 'cashier' | 'finance_manager' | 'director';
export type UserStatus = 'active' | 'inactive' | 'blocked';
export type ExpenseType = 'fixed' | 'variable';
export type PeriodStatus = 'open' | 'closed';
export type TrendGranularity = 'daily' | 'weekly' | 'monthly';

export interface Branch {
  id: UUID;
  code: 'SAYXUN' | 'XALQLAR';
  name: string;
  isActive: boolean;
}

export interface RoleAssignment {
  id: UUID;
  role: RoleCode;
  roleName: string;
  branchId: UUID | null;
  branchName: string | null;
}

export interface AuthenticatedUser {
  id: UUID;
  fullName: string;
  phone: string;
  status: UserStatus;
  roles: RoleAssignment[];
  permissions: PermissionCode[];
  branchScopes: UUID[];
  writeBranchScopes: UUID[];
  /** Oylik fix oylik — kassirlar hisobotida ishlatiladi. */
  fixedSalaryUzs: MoneyUzs;
  lastLoginAt: IsoDateTime | null;
}

export interface UserCreateInput {
  fullName: string;
  phone: string;
  role: RoleCode;
  branchId: UUID | null;
  cashierBranchId: UUID | null;
}

export interface UserAccessUpdateInput {
  roles: Array<{ role: RoleCode; branchId: UUID | null }>;
}

export type RolePermissionMatrix = Record<RoleCode, PermissionCode[]>;

export interface UserDirectoryItem {
  id: UUID;
  fullName: string;
  status: UserStatus;
  roles: RoleAssignment[];
}

export interface AccountingPeriod {
  id: UUID;
  year: number;
  month: number;
  label: string;
  status: PeriodStatus;
  closedAt: IsoDateTime | null;
  closedByName: string | null;
}

export interface ExpenseCategory {
  id: UUID;
  code: string;
  name: string;
  expenseType: ExpenseType;
  isActive: boolean;
  aliases: string[];
}

export interface MasterItem {
  id: UUID;
  code: string;
  name: string;
  isActive: boolean;
}

export interface Expense {
  id: UUID;
  transactionDate: IsoDate;
  periodId: UUID;
  branchId: UUID;
  branchName: string;
  categoryId: UUID;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: ExpenseType;
  description: string;
  amountUzs: MoneyUzs;
  paymentMethodId: UUID;
  paymentMethodName: string;
  departmentId: UUID;
  departmentName: string;
  responsibleUserId: UUID;
  responsibleUserName: string;
  enteredBy: UUID;
  enteredByName: string;
  comment: string | null;
  /** Excel’dan import qilingan bo‘lsa — manba varaq va qator (takroriy importni to‘xtatadi). */
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TelegramRecipient {
  userId: UUID;
  fullName: string;
  /** Telegram chat ID — bo‘sh bo‘lsa, bu xodimga xabar yuborilmaydi. */
  chatId: string;
}

export interface TelegramSettings {
  enabled: boolean;
  /** Token hech qachon qaytarilmaydi — faqat o‘rnatilgani ma’lum bo‘ladi. */
  botTokenSet: boolean;
  dailyReminderEnabled: boolean;
  /** Toshkent vaqti bo‘yicha HH:mm. */
  reminderTimeLocal: string;
  monthlyReportEnabled: boolean;
  /** Oyning nechanchi kunida hisobot yuboriladi (1–28). */
  monthlyReportDay: number;
  recipients: TelegramRecipient[];
}

export interface TelegramSettingsInput {
  enabled: boolean;
  botToken?: string | undefined;
  dailyReminderEnabled: boolean;
  reminderTimeLocal: string;
  monthlyReportEnabled: boolean;
  monthlyReportDay: number;
  recipients: TelegramRecipient[];
}

export interface ReminderPreview {
  businessDate: IsoDate;
  branches: Array<{
    branchId: UUID;
    branchName: string;
    totalUzs: MoneyUzs | null;
    recipients: TelegramRecipient[];
    message: string | null;
  }>;
}

export interface MonthlyReportPreview {
  periodLabel: string;
  message: string;
  recipients: TelegramRecipient[];
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  totalUzs: MoneyUzs;
  rejected: Array<{ sourceSheet: string; sourceRow: number; message: string }>;
}

export interface ExpenseCreateInput {
  transactionDate: IsoDate;
  branchId?: UUID;
  categoryId: UUID;
  description: string;
  amountUzs: MoneyUzs;
  paymentMethodId: UUID;
  departmentId: UUID;
  responsibleUserId: UUID;
  comment?: string | undefined;
  idempotencyKey: string;
}

export interface BudgetLine {
  id: UUID;
  branchId: UUID;
  branchName: string;
  categoryId: UUID;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: ExpenseType;
  plannedAmountUzs: MoneyUzs | null;
  actualAmountUzs: MoneyUzs;
  varianceUzs: MoneyUzs | null;
  hasPlan: boolean;
}

export interface BudgetPlan {
  id: UUID;
  periodId: UUID;
  periodLabel: string;
  updatedAt: IsoDateTime;
  updatedByName: string;
  lines: BudgetLine[];
}

/** Bir kun + bir filial = bitta kunlik tushum yozuvi. */
export interface DailyRevenue {
  id: UUID;
  businessDate: IsoDate;
  periodId: UUID;
  branchId: UUID;
  branchName: string;
  cashUzs: MoneyUzs;
  cardUzs: MoneyUzs;
  transferUzs: MoneyUzs;
  totalUzs: MoneyUzs;
  comment: string | null;
  enteredBy: UUID;
  enteredByName: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface DailyRevenueInput {
  businessDate: IsoDate;
  branchId?: UUID;
  cashUzs: MoneyUzs;
  cardUzs: MoneyUzs;
  transferUzs: MoneyUzs;
  comment?: string | undefined;
  idempotencyKey: string;
}

/** Oylik tushum rejasi: filial × davr. Kunlik/haftalik reja shundan bo‘linadi. */
export interface RevenuePlanLine {
  id: UUID;
  branchId: UUID;
  branchName: string;
  plannedAmountUzs: MoneyUzs | null;
  actualAmountUzs: MoneyUzs;
  varianceUzs: MoneyUzs | null;
  completionPercent: number | null;
  hasPlan: boolean;
  dailyPlanUzs: MoneyUzs | null;
}

export interface RevenuePlanBoard {
  id: UUID;
  periodId: UUID;
  periodLabel: string;
  daysInMonth: number;
  updatedAt: IsoDateTime;
  updatedByName: string;
  lines: RevenuePlanLine[];
}

export interface TrendPoint {
  bucket: string;
  label: string;
  planUzs: MoneyUzs;
  actualUzs: MoneyUzs;
}

/** Excel «Xulosa» varag‘i: yillik kesim, doimiy ulushi va oylik dinamika. */
export interface AnnualExpenseSummary {
  year: number;
  totalActualUzs: MoneyUzs;
  fixedActualUzs: MoneyUzs;
  variableActualUzs: MoneyUzs;
  fixedSharePct: number | null;
  totalPlanUzs: MoneyUzs;
  varianceUzs: MoneyUzs;
  averageMonthlyUzs: MoneyUzs;
  averageMonthsCount: number;
  peakMonth: { month: number; label: string; actualUzs: MoneyUzs } | null;
  months: Array<{
    month: number;
    label: string;
    fixedUzs: MoneyUzs;
    variableUzs: MoneyUzs;
    actualUzs: MoneyUzs;
    planUzs: MoneyUzs;
    varianceUzs: MoneyUzs;
    completionPct: number | null;
  }>;
}

export interface DashboardResponse {
  isDemo: boolean;
  period: AccountingPeriod;
  branchId: UUID | null;
  granularity: TrendGranularity;
  expensePlanUzs: MoneyUzs;
  expenseActualUzs: MoneyUzs;
  expenseVarianceUzs: MoneyUzs;
  expenseCompletionPct: number | null;
  fixedExpenseUzs: MoneyUzs;
  variableExpenseUzs: MoneyUzs;
  expenseTrend: TrendPoint[];
  revenuePlanUzs: MoneyUzs;
  revenueActualUzs: MoneyUzs;
  revenueVarianceUzs: MoneyUzs;
  revenueCompletionPct: number | null;
  revenueTrend: TrendPoint[];
  annual: AnnualExpenseSummary;
  branches: Array<{
    branchId: UUID;
    name: string;
    expensePlanUzs: MoneyUzs;
    expenseActualUzs: MoneyUzs;
    expenseCompletionPct: number | null;
    revenuePlanUzs: MoneyUzs;
    revenueActualUzs: MoneyUzs;
    revenueCompletionPct: number | null;
  }>;
}

export interface HistoricalRef {
  id: UUID;
  code: string;
  name: string;
  snapshotName?: string;
}

export interface PlanActual {
  hasPlan: boolean;
  plannedAmountUzs: MoneyUzs | null;
  actualAmountUzs: MoneyUzs;
  varianceUzs: MoneyUzs | null;
  completionPercent: number | null;
  status: 'no_plan' | 'unplanned' | 'under_plan' | 'on_plan' | 'over_plan';
}

export interface MonthlyReportRow {
  category: HistoricalRef & { expenseTypeSnapshot: ExpenseType };
  months: Array<{ month: number; planActual: PlanActual; transactionCount: number }>;
  annual: PlanActual & { transactionCount: number };
}

export interface MonthlyReport {
  year: number;
  branchFilter: UUID | 'all';
  averagePolicy: {
    code: 'calendar_12' | 'elapsed_months' | 'months_with_actual';
    label: string;
    denominator: number;
  };
  rows: MonthlyReportRow[];
  totals: { fixed: PlanActual; variable: PlanActual; overall: PlanActual };
}

export interface BranchSummary {
  branch: HistoricalRef;
  expense: PlanActual;
}

export interface BranchComparisonReport {
  year: number;
  months: Array<{ month: number; branches: BranchSummary[]; total: BranchSummary }>;
  annual: { branches: BranchSummary[]; total: BranchSummary };
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  nextCursor: string | null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}
