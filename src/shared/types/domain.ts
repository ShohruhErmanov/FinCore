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
  | 'user.deactivate'
  | 'user.delete'
  | 'role.manage'
  | 'audit.view'
  | 'investor.view_own'
  | 'investor.view_all'
  | 'investor.manage'
  | 'investor.settlement.request'
  | 'investor.settlement.approve'
  | 'investor.settlement.pay';

export type RoleCode = 'cashier' | 'finance_manager' | 'director' | 'investor' | 'business_owner';
export type UserStatus = 'active' | 'inactive' | 'blocked';
export type ExpenseType = 'fixed' | 'variable';
export type PeriodStatus = 'open' | 'closed';
export type BudgetVersionStatus = 'draft' | 'submitted' | 'approved' | 'locked';
export type TrendGranularity = 'daily' | 'weekly' | 'monthly';

export interface Branch {
  id: UUID;
  /**
   * Barqaror biznes kodi. Ilgari faqat SAYXUN/XALQLAR bo‘lgan; direktor
   * Sozlamalarda yangi filial ocha olgani uchun endi ochiq matn.
   */
  code: string;
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
  /** Kamida 12 belgi. Server bcrypt bilan xeshlaydi; javobda hech qachon qaytmaydi. */
  password: string;
  confirmPassword: string;
  /** Faqat role='investor' uchun: kompaniyadagi ulush foizi (olingan summa foizi EMAS). */
  ownershipPercent?: number;
  /** Faqat investor: kompaniyaga amalda kiritilgan boshlang‘ich kapital. */
  capitalAmountUzs?: MoneyUzs;
  /** Faqat investor: foyda ulushi hisoblanadigan birinchi oy. */
  startPeriodId?: UUID;
  /** Kapital qanday shaklda kiritilgani; payout usuli emas. */
  capitalPaymentMethodCode?: InvestorCapitalPaymentMethodCode;
  /** Ixtiyoriy: joriy davr uchun tegishli summa. Qolgan oylar alohida kiritiladi. */
  entitledAmountUzs?: MoneyUzs;
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

export interface AuditLogRow {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  result: 'success' | 'failure' | 'denied';
  branchName: string | null;
  occurredAt: IsoDateTime;
}

export interface AuditLogPage {
  data: AuditLogRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
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

/**
 * Direktorning boshlang‘ich oylik reja jadvali — Excel «Sozlamalar» varag‘idagi
 * «Boshlang‘ich Sayxun / Xalqlar do‘stligi / jami» ustunlari.
 *
 * Bu oylik budjet EMAS: hisobotlar baribir budjet qatorlaridan o‘qiydi.
 */
export interface CategoryBaselineBranch {
  branchId: UUID;
  code: string;
  name: string;
}

export interface CategoryBaselineRow {
  categoryId: UUID;
  code: string;
  name: string;
  expenseType: ExpenseType;
  isActive: boolean;
  /** branchId → butun so‘m. Har bir faol filial uchun doimo qiymat bo‘ladi. */
  amounts: Record<UUID, MoneyUzs>;
  /** Qator jami — serverda hisoblanadi, saqlanmaydi. */
  totalUzs: MoneyUzs;
}

export interface CategoryBaselineBoard {
  branches: CategoryBaselineBranch[];
  rows: CategoryBaselineRow[];
  totals: {
    /** branchId → ustun jami. */
    byBranch: Record<UUID, MoneyUzs>;
    /** «Jami oylik reja (byudjet)». */
    grandTotalUzs: MoneyUzs;
  };
}

export interface CategoryBaselineInput {
  categoryId: UUID;
  branchId: UUID;
  amountUzs: MoneyUzs;
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
  /**
   * Xodim o‘z Telegramini tasdiqlaganmi. Serverda hisoblanadi — chat ID hech
   * qachon mijozga berilmaydi va mijozdan qabul qilinmaydi.
   */
  linked: boolean;
}

export interface NotificationInboxItem {
  id: UUID;
  eventType: string;
  message: string;
  occurredAt: IsoDateTime;
  telegramStatus: string;
}

/** O‘z hisobing uchun Telegram ulanish holati. Hech qanday identifikator qaytmaydi. */
export interface TelegramLinkStatus {
  status: 'linked' | 'unlinked' | 'disabled' | 'pending';
  /** Faqat ko‘rsatish uchun. */
  telegramUsername: string | null;
  displayName: string | null;
  linkedAt: IsoDateTime | null;
  pendingExpiresAt: IsoDateTime | null;
}

/** Bir martalik havola — saqlanmaydi, faqat foydalanuvchiga ko‘rsatiladi. */
export interface TelegramLinkCreated {
  deepLink: string;
  expiresAt: IsoDateTime;
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
  /** Bot tokeni bu yerda yo‘q va bo‘lmaydi — u faqat server muhitida yashaydi. */
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
  reason: string | null;
}

export interface BudgetPlan {
  id: UUID;
  periodId: UUID;
  periodLabel: string;
  updatedAt: IsoDateTime;
  updatedByName: string;
  lines: BudgetLine[];
}

export interface BudgetHistoryBranchPlan {
  branchId: UUID;
  branchName: string;
  plannedAmountUzs: MoneyUzs | null;
  hasPlan: boolean;
  reason: string | null;
}

export interface BudgetHistoryRow {
  categoryId: UUID;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: ExpenseType;
  branches: BudgetHistoryBranchPlan[];
  totalPlannedAmountUzs: MoneyUzs | null;
  reason: string | null;
}

export interface BudgetHistoryPeriod {
  periodId: UUID;
  year: number;
  month: number;
  periodLabel: string;
  periodStatus: AccountingPeriod['status'];
  budgetVersionId: UUID | null;
  revisionNo: number | null;
  versionStatus: BudgetVersionStatus | null;
  versionReason: string | null;
  updatedAt: IsoDateTime | null;
  updatedByName: string;
  rows: BudgetHistoryRow[];
  totalsByBranch: BudgetHistoryBranchPlan[];
  totalPlannedAmountUzs: MoneyUzs | null;
}

export interface BudgetHistory {
  year: number | null;
  branches: Array<Pick<Branch, 'id' | 'code' | 'name' | 'isActive'>>;
  periods: BudgetHistoryPeriod[];
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

/** One branch's plan and revenue for one month of the year overview. */
export interface RevenuePlanYearCell {
  branchId: UUID;
  plannedAmountUzs: MoneyUzs | null;
  actualAmountUzs: MoneyUzs;
  completionPercent: number | null;
}

export interface RevenuePlanYearMonth {
  month: number;
  label: string;
  /** null when that month's accounting period has not been opened. */
  periodId: UUID | null;
  /** Sum over the branches that have a plan; null when none do. */
  plannedAmountUzs: MoneyUzs | null;
  /** Every posted revenue that month. */
  actualAmountUzs: MoneyUzs;
  /** Revenue of the branches that had a plan — what completion is measured on. */
  actualAgainstPlanUzs: MoneyUzs;
  completionPercent: number | null;
  branches: RevenuePlanYearCell[];
}

export interface RevenuePlanYearBranch {
  branchId: UUID;
  branchName: string;
  plannedAmountUzs: MoneyUzs;
  actualAmountUzs: MoneyUzs;
  actualAgainstPlanUzs: MoneyUzs;
  completionPercent: number | null;
  plannedMonths: number;
}

/** Every month's revenue plan for a year, side by side — GET /revenue-plans/year/:year. */
export interface RevenuePlanYear {
  year: number;
  plannedAmountUzs: MoneyUzs;
  actualAmountUzs: MoneyUzs;
  actualAgainstPlanUzs: MoneyUzs;
  completionPercent: number | null;
  plannedMonths: number;
  branches: RevenuePlanYearBranch[];
  months: RevenuePlanYearMonth[];
}

export interface TrendPoint {
  bucket: string;
  label: string;
  planUzs: MoneyUzs;
  actualUzs: MoneyUzs;
}

/** Excel «Xulosa» varag‘i: yillik kesim, doimiy ulushi va oylik dinamika. */
/** Oylik tushum o‘sishi: tanlangan kalendar oy jami oldingi to‘liq oy bilan solishtiriladi. */
export interface MonthlyRevenueGrowth {
  month: number;
  monthLabel: string;
  previousMonth: number;
  previousMonthLabel: string;
  currentUzs: MoneyUzs;
  previousUzs: MoneyUzs;
  changePct: number | null;
  /** API mosligi uchun saqlangan; to‘liq kalendar oy taqqoslashida null. */
  throughDay: number | null;
}

export interface AnnualRevenueGrowth {
  year: number;
  previousYear: number;
  currentUzs: MoneyUzs;
  previousUzs: MoneyUzs;
  changePct: number | null;
}

/** Oylik va yillik o'sish — ataylab ikkita alohida ko'rsatkich. */
export interface RevenueGrowth {
  monthly: MonthlyRevenueGrowth;
  annual: AnnualRevenueGrowth;
}

/** Yillik tushum xulosasi — xarajat xulosasining tushum tomoni. */
export interface RevenueMonth {
  month: number;
  label: string;
  actualUzs: MoneyUzs;
  planUzs: MoneyUzs;
  completionPct: number | null;
}

export interface AnnualRevenue {
  year: number;
  totalActualUzs: MoneyUzs;
  totalPlanUzs: MoneyUzs;
  completionPct: number | null;
  /** Faqat tushum bo'lgan oylar bo'yicha o'rtacha. */
  averageMonthlyUzs: MoneyUzs;
  averageMonthsCount: number;
  peakMonth: { month: number; label: string; actualUzs: MoneyUzs } | null;
  /** O'tgan yilga nisbatan o'sish; o'tgan yil bo'sh bo'lsa null. */
  growthPct: number | null;
  previousYear: number;
  previousYearUzs: MoneyUzs;
  months: RevenueMonth[];
}

/** Bir oyning sof foydasi: fakt tushum minus fakt xarajat. */
export interface NetProfitMonth {
  month: number;
  label: string;
  revenueUzs: MoneyUzs;
  expenseUzs: MoneyUzs;
  netProfitUzs: MoneyUzs;
  /** Oldingi ma'lumotli oyga nisbatan o'zgarish; taqqoslash bo'lmasa null. */
  changePct: number | null;
  /** changePct qaysi oyga nisbatan o'lchangani; o'zgarish bo'lmasa null. */
  comparedToLabel: string | null;
  /** Oyda na tushum, na xarajat yozilgan bo'lsa false. */
  hasData: boolean;
}

export interface AnnualNetProfit {
  year: number;
  totalNetProfitUzs: MoneyUzs;
  /** (sof foyda / tushum) x 100; tushum nol bo'lsa null. */
  netMarginPct: number | null;
  /** Faqat ma'lumotli oylar orasidan; bo'sh oy "eng past" bo'la olmaydi. */
  bestMonth: { month: number; label: string; netProfitUzs: MoneyUzs } | null;
  worstMonth: { month: number; label: string; netProfitUzs: MoneyUzs } | null;
  monthsWithData: number;
  months: NetProfitMonth[];
  paymentMethods: Array<{
    paymentMethodId: UUID;
    code: string;
    name: string;
    revenueUzs: MoneyUzs;
    expenseUzs: MoneyUzs;
    netProfitUzs: MoneyUzs;
    sharePct: number;
  }>;
  paymentMethodMonths: Array<{
    month: number;
    label: string;
    totalNetProfitUzs: MoneyUzs;
    paymentMethods: Array<{
      paymentMethodId: UUID;
      code: string;
      name: string;
      netProfitUzs: MoneyUzs;
    }>;
  }>;
}

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
  averagePlannedMonthlyUzs: MoneyUzs;
  averagePlanMonthsCount: number;
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
  annualRevenue: AnnualRevenue;
  revenueGrowth: RevenueGrowth;
  /** Backend omits company-profit aggregates for operational-only roles. */
  annualNetProfit?: AnnualNetProfit;
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

export interface ExpensePlanAnalytics {
  period: {
    id: UUID;
    year: number;
    month: number;
    label: string;
  };
  branchFilter: UUID | 'all';
  hasPlan: boolean;
  summary: {
    fixedPlanUzs: MoneyUzs;
    variablePlanUzs: MoneyUzs;
    totalPlanUzs: MoneyUzs;
    branchCount: number;
  };
  branches: Array<{
    branchId: UUID;
    branchName: string;
    hasPlan: boolean;
    fixedPlanUzs: MoneyUzs;
    variablePlanUzs: MoneyUzs;
    totalPlanUzs: MoneyUzs;
  }>;
}

export interface ExpenseAnalyticsBreakdown {
  amountUzs: MoneyUzs;
  transactionCount: number;
  sharePct: number | null;
}

export interface ExpenseAnalyticsPaymentMethod extends ExpenseAnalyticsBreakdown {
  id: UUID;
  code: string;
  name: string;
}

export interface ExpenseAnalytics {
  filters: { from: IsoDate; to: IsoDate; branch: UUID | 'all' };
  hasData: boolean;
  planComparison: {
    periodId: UUID;
    periodLabel: string;
    hasPlan: boolean;
    plannedAmountUzs: MoneyUzs;
    actualAmountUzs: MoneyUzs;
    varianceUzs: MoneyUzs;
    completionPct: number | null;
  };
  summary: {
    totalAmountUzs: MoneyUzs;
    transactionCount: number;
    fixed: ExpenseAnalyticsBreakdown;
    variable: ExpenseAnalyticsBreakdown;
  };
  paymentMethods: ExpenseAnalyticsPaymentMethod[];
  branches: Array<{
    branchId: UUID;
    branchName: string;
    totalAmountUzs: MoneyUzs;
    transactionCount: number;
    fixedAmountUzs: MoneyUzs;
    variableAmountUzs: MoneyUzs;
    paymentMethods: ExpenseAnalyticsPaymentMethod[];
  }>;
  categories: Array<{
    categoryId: UUID;
    categoryCodeSnapshot: string;
    categoryNameSnapshot: string;
    expenseTypeSnapshot: ExpenseType;
    amountUzs: MoneyUzs;
    transactionCount: number;
    sharePct: number | null;
  }>;
  recentExpenses: Array<{
    id: UUID;
    transactionDate: IsoDate;
    description: string;
    amountUzs: MoneyUzs;
    expenseTypeSnapshot: ExpenseType;
    branchName: string;
    categoryNameSnapshot: string;
    paymentMethodName: string;
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
  /** Omitted when the signed-in role may not read company net profit. */
  financialMonths?: Array<{
    month: number;
    revenuePlanUzs: MoneyUzs | null;
    revenueActualUzs: MoneyUzs;
    expenseActualUzs: MoneyUzs;
    netProfitUzs: MoneyUzs;
    revenueCompletionPercent: number | null;
    netMarginPercent: number | null;
  }>;
}

export interface BranchSummary {
  branch: HistoricalRef;
  expense: PlanActual;
}

export interface TwoBranchMonthRow {
  category: HistoricalRef & { expenseTypeSnapshot: ExpenseType };
  branches: BranchSummary[];
  total: BranchSummary;
}

export interface BranchComparisonReport {
  year: number;
  selectedMonth: {
    month: number;
    label: string;
    rows: TwoBranchMonthRow[];
    branches: BranchSummary[];
    total: BranchSummary;
  };
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

// ---------------------------------------------------------------------------
// PHASE 45 — Investor ulushi va hisob-kitobi
//
// ownershipPercent kompaniyadagi ulush (masalan 2%), paidPercent esa tegishli
// summaning necha foizi olinganligi (masalan 80%). Bular hech qachon bitta
// maydonda birlashtirilmaydi.
// ---------------------------------------------------------------------------

export type SettlementStatus =
  | 'no_entitlement'
  | 'unpaid'
  | 'partially_paid'
  | 'settled'
  | 'overpaid';

export interface Settlement {
  entitledAmountUzs: MoneyUzs;
  paidAmountUzs: MoneyUzs;
  /** Hech qachon manfiy emas — ortiqcha to'lov alohida maydonda. */
  remainingAmountUzs: MoneyUzs;
  overpaidAmountUzs: MoneyUzs;
  paidPercent: number;
  remainingPercent: number;
  /** paidPercent 100 bilan cheklangan — progress bar uchun. */
  settledPercent: number;
  status: SettlementStatus;
}

export interface InvestorRef {
  id: UUID;
  userId: UUID;
  fullName: string;
  phone: string | null;
  ownershipPercent: number;
  branch: { id: UUID; code: string; name: string } | null;
  isActive: boolean;
  capitalContribution?: InvestorCapitalContribution | null;
}

export type InvestorCapitalPaymentMethodCode = 'CASH' | 'CARD' | 'BANK_TRANSFER';

export interface InvestorCapitalContribution {
  amountUzs: MoneyUzs;
  startPeriod: { id: UUID; year: number; month: number; label: string };
  paymentMethod: { id: UUID; code: InvestorCapitalPaymentMethodCode; name: string };
}

export type InvestorListItem = InvestorRef & { annual: Settlement };

export interface InvestorMonthRow {
  month: number;
  label: string;
  periodId: UUID | null;
  settlement: Settlement;
  paymentCount: number;
}

export interface InvestorPaymentRow {
  id: UUID;
  paidOn: string;
  amountUzs: MoneyUzs;
  status: 'posted' | 'reversed';
  note: string | null;
  reversalReason: string | null;
  createdAt: string;
}

export interface InvestorDashboard {
  investor: InvestorRef;
  year: number;
  /** Oylik qatorlarning haqiqiy yig'indisi, alohida saqlangan raqam emas. */
  annual: Settlement;
  months: InvestorMonthRow[];
  payments: InvestorPaymentRow[];
}

/**
 * NUMERIC(20,2) so'm, ikki kasrli string sifatida. MoneyUzs (butun so'm) dan
 * ataylab ajratilgan: ulush — hisoblangan nisbat, to'lov esa haqiqiy pul.
 */
export type ShareUzs = string;

export type PayoutStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export interface PayoutRequestRow {
  id: UUID;
  investorId: UUID;
  investorName: string;
  periodId: UUID;
  year: number;
  month: number;
  monthLabel: string;
  /** So'ralgan summa — butun so'm, chunki to'lov shunday amalga oshadi. */
  requestedAmountUzs: MoneyUzs;
  /** So'rov yuborilgan paytdagi ulush — hozirgisi emas. */
  calculatedShareUzs: ShareUzs;
  factRevenueUzs: MoneyUzs;
  ownershipPercent: number;
  status: PayoutStatus;
  investorNote: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  paidOn: string | null;
  createdAt: string;
}

export interface PayoutAvailability {
  shareUzs: ShareUzs;
  paidUzs: ShareUzs;
  openUzs: ShareUzs;
  remainingUzs: ShareUzs;
  /** So'ralishi mumkin bo'lgan eng katta butun so'm. */
  payableUzs: MoneyUzs;
  /** Qolgan summaning bir so'mdan kichik qismi — hech qachon to'lanmaydi. */
  residualUzs: ShareUzs;
  isSettled: boolean;
}

export interface PayoutPeriodRow extends PayoutAvailability {
  month: number;
  label: string;
  periodId: UUID;
  factRevenueUzs: MoneyUzs;
  ownershipPercent: number;
  requests: PayoutRequestRow[];
}

export interface PayoutSummary {
  investor: InvestorRef;
  year: number;
  annual: PayoutAvailability & { factRevenueUzs: MoneyUzs };
  months: PayoutPeriodRow[];
}

/** Direktor ro'yxati uchun: investor + uning yillik ulushi. */
export interface PayoutListItem extends InvestorRef {
  annual: PayoutAvailability & { factRevenueUzs: MoneyUzs };
}

export interface PayoutRequestInput {
  periodId: UUID;
  amountUzs: MoneyUzs;
  note?: string;
}

export interface InvestorCreateInput {
  userId: UUID;
  ownershipPercent: number;
  branchId?: UUID;
  note?: string;
}

export interface InvestorEntitlementInput {
  periodId: UUID;
  entitledAmountUzs: MoneyUzs;
  note?: string;
}

export interface InvestorPaymentInput {
  paidOn: string;
  amountUzs: MoneyUzs;
  note?: string;
}
