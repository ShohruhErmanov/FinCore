# FINCORE frontend API kontrakti

**Versiya:** 1.0  
**Sana:** 2026-08-21  
**Asosiy manba:** `PLATFORM_TZ_FROM_GOOGLE_SHEET.md` v1.2, 7-bo‘lim  
**Maqsad:** React frontend, MSW mock va real backend uchun yagona typed boundary

## 1. Kontrakt holati

Ushbu hujjat ikki xil endpointni aniq ajratadi:

- **TZ-tasdiqlangan** — authoritative TZ 7-bo‘limida endpoint yoki endpoint oilasi ko‘rsatilgan;
- **Taklif** — majburiy UI’ni ishlatish uchun kerak, lekin TZ minimal REST jadvalida to‘liq belgilanmagan. Mock’da ishlatilishi mumkin, real backend bilan alohida tasdiqlanadi.

Frontend DB schema, table/view yoki PostgreSQL function nomiga bog‘lanmaydi. DTO camelCase ishlatadi. Backend ichki nomlari boshqacha bo‘lishi mumkin.

Bu hujjat backend implementatsiyasi tayyor degani emas. Har bir `Taklif` endpoint tasdiqlanmaguncha `FRONTEND_IMPLEMENTATION_PLAN.md`dagi backend dependency ochiq qoladi.

### Joriy implementatsiya holati

- `src/shared/api/contracts.ts` — browser ishlatayotgan current typed endpoint map;
- `src/mocks/handlers.ts` — development/test uchun stateful MSW implementatsiyasi;
- production backend adapteri, real HTTP-only session va PostgreSQL persistence bu repository’da integratsiya qilinmagan.

Shuning uchun quyida `Joriy MSW/client` deb ko‘rsatilgan oqim ishlashi UI kontraktining dalili, real server kontrakt-testi emas. `TZ-tasdiqlangan` va `Taklif` tasnifi saqlanadi.

## 2. Transport qoidalari

| Qoida           | Talab                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Base URL        | `VITE_API_BASE_URL`, trailing slashsiz                                             |
| Format          | `application/json; charset=utf-8`                                                  |
| Auth            | HTTP-only secure cookie/session                                                    |
| Browser request | `credentials: 'include'`                                                           |
| CSRF            | state-changing requestlarda backend belgilagan same-site/CSRF header siyosati      |
| Correlation     | frontend `X-Request-ID` yuborishi yoki response’dagi request ID’ni saqlashi mumkin |
| Idempotency     | expense/revenue create’da body `idempotencyKey` va aynan shu `Idempotency-Key` header; qolgan transitionlar uchun backend siyosati ochiq |
| Timezone        | canonical event RFC3339; display `Asia/Tashkent`                                   |
| Money           | integer decimal string, tiyin yo‘q                                                 |
| Versioning      | base path yoki content negotiation; backend bilan tasdiqlanadi                     |

Mutation body’ga actor/audit maydonlari yuborilmaydi. Backend authenticated sessiondan aniqlaydi:

- `enteredBy`;
- `createdBy`;
- `updatedBy`;
- `approvedBy`;
- `reviewedBy`;
- `reversedBy`;
- accounting period;
- category snapshot;
- status/timestamp.

Current client bodydagi `idempotencyKey`ni avtomatik headerga ko‘chiradi. Expense va revenue create formasi stable UUID’ni component lifetime davomida qayta ishlatadi; MSW bir xil user+key replayini bitta yozuvga deduplicate qiladi va header/body mismatchni `422 IDEMPOTENCY_KEY_REQUIRED` bilan rad etadi. Joriy mock payload hashini solishtirmaydi. Bu durable, cross-process yoki DB-backed idempotency emas; production backend key+payload collision, transaction va concurrency semantikasini alohida ta’minlashi kerak.

## 3. Primitive typelar

Quyidagi TypeScript shakllari ma’noni ko‘rsatadi. Joriy generic client barcha DTO fieldlarini to‘liq Zod parse qilmaydi; u error body va rekursiv `*Uzs`, date, timestamp hamda percentage invariantlarini runtime tekshiradi. Full per-endpoint response schema production hardening backlogida qoladi.

```ts
type Uuid = string;
type MoneyUzs = string; // /^-?(0|[1-9]\d*)$/, canonical finance amount
type NonNegativeMoneyUzs = string;
type PositiveMoneyUzs = string;
type Percentage = number | null; // finite decimal percent; null = denominator yo‘q/0
type DateOnly = string; // YYYY-MM-DD
type MonthKey = string; // YYYY-MM
type OffsetDateTime = string; // RFC3339 explicit Z yoki ±HH:mm
type Cursor = string;
```

Validation:

- input money uchun faqat musbat butun UZS, whitespace grouping displaydan oldin olib tashlanadi;
- API `number` ko‘rinishidagi katta pulni qabul qilmaydi;
- `Percentage=null` UI’da `—`;
- `DateOnly` JavaScript `Date` orqali timezone conversion qilinmaydi;
- `OffsetDateTime` explicit offsetga ega bo‘lishi shart;
- ID opaque, frontend uning formatidan biznes ma’no chiqarmaydi.

## 4. Common DTO

```ts
type UserStatus = 'active' | 'inactive' | 'blocked';
type PeriodStatus = 'open' | 'closed';
type ExpenseType = 'fixed' | 'variable';
type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reversed';
type PlanStatus = 'draft' | 'submitted' | 'approved' | 'locked';
type RevenueStatus = 'posted' | 'reversed';

interface EntityRefDto {
  id: Uuid;
  code?: string;
  name: string;
  isActive?: boolean;
}

interface HistoricalRefDto extends EntityRefDto {
  /** Fact paytidagi label; mavjud bo‘lsa report live name o‘rniga shuni ko‘rsatadi. */
  snapshotName?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  nextCursor: Cursor | null;
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

Joriy list DTO page-based metadata va optional keyingi cursorni birga qaytaradi. Aggregate kerak bo‘lsa alohida summary/report fieldida server/MSW’dagi to‘liq filtered datasetdan keladi; visible page’dan canonical hisob qilinmaydi. Production 500+ pagination contracti va cursor stability hali integration test talab qiladi.

## 5. Identity va permission DTO

```ts
type PermissionCode =
  | 'dashboard.view'
  | 'expense.view_own_branch'
  | 'expense.view_all_branches'
  | 'expense.create'
  | 'expense.edit'
  | 'expense.correct_reverse'
  | 'expense.submit'
  | 'expense.approve'
  | 'expense.reject'
  | 'budget.view'
  | 'budget.create_edit'
  | 'budget.submit'
  | 'budget.approve'
  | 'revenue.create'
  | 'revenue.view_own'
  | 'revenue.view_all'
  | 'revenue.reverse'
  | 'revenue.enter_on_behalf'
  | 'revenue_plan.create_edit'
  | 'revenue_plan.submit'
  | 'revenue_plan.approve'
  | 'reports.view'
  | 'reports.view_cashiers'
  | 'period.close'
  | 'period.reopen'
  | 'master_data.manage'
  | 'import.run'
  | 'import.resolve_exception'
  | 'audit.view'
  | 'user.manage'
  | 'role.manage';

interface RoleAssignmentDto {
  id: Uuid;
  role: 'cashier' | 'finance_manager' | 'director';
  roleName: string;
  branchId: Uuid | null;
  branchName: string | null;
}

interface AuthenticatedUserDto {
  id: Uuid;
  fullName: string;
  phone: string;
  status: UserStatus;
  roles: RoleAssignmentDto[];
  permissions: PermissionCode[];
  /** Read/report scope. */
  branchScopes: Uuid[];
  /** Expense/revenue mutation scope; branchScopes bilan teng bo‘lishi shart emas. */
  writeBranchScopes: Uuid[];
  lastLoginAt: OffsetDateTime | null;
}

interface SafeUserDto {
  id: Uuid;
  fullName: string;
  status: UserStatus;
  roles: RoleAssignmentDto[];
}

interface BranchDto {
  id: Uuid;
  code: string;
  name: string;
  isActive: boolean;
}
```

`SafeUserDto` hech qachon `phone`, `permissions`, `branchScopes`, `writeBranchScopes` yoki `passwordHash` olmaydi. Current `/users/directory` aynan `id/fullName/status/roles` qaytaradi va rowlarni current read scope bilan cheklaydi. Telefon va access maydonlari faqat `user.manage`li `/admin/users` DTO’da qaytadi. Selectorlar safe projectiondan foydalanadi; historical fact/report DTO’lari esa imkon qadar yanada tor actor/ref projectionini oladi.

`branchScopes` va `writeBranchScopes` alohida capability. Masalan finance+kassir ikkala filial reportini ko‘rishi (`branchScopes=[Sayxun,Xalqlar]`), ammo faqat Sayxunga yozishi (`writeBranchScopes=[Sayxun]`) mumkin. `branch=all` read filteri hech qachon write scope bermaydi. Frontend selectorni shunga mos cheklaydi; production backend har mutationda branchni sessiondan olingan write scope bilan qayta tekshirishi shart.

## 6. Accounting period DTO

```ts
interface AccountingPeriodDto {
  id: Uuid;
  year: number;
  month: number;
  label: string;
  status: PeriodStatus;
  closedAt: OffsetDateTime | null;
  closedByName: string | null;
}

interface PeriodStatusEventDto {
  id: string;
  action: 'closed' | 'reopened';
  actorName: string;
  reason: string;
  occurredAt: OffsetDateTime;
}
```

## 7. Expense DTO va requestlar

```ts
interface AuditEventDto {
  id: Uuid;
  occurredAt: OffsetDateTime;
  actorId: Uuid;
  actorName: string;
  action: string;
  entityType: string;
  entityId: Uuid | string;
  branchId: Uuid | null;
  branchName: string | null;
  result: 'success' | 'denied' | 'failed';
  reason: string | null;
  changes?: Array<{ field: string; before: string | null; after: string | null }>;
}

interface ExpenseDto {
  id: Uuid;
  transactionDate: DateOnly;
  periodId: Uuid;
  branchId: Uuid;
  branchName: string;
  categoryId: Uuid;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: ExpenseType;
  description: string;
  amountUzs: PositiveMoneyUzs;
  paymentMethodId: Uuid;
  paymentMethodName: string;
  departmentId: Uuid;
  departmentName: string;
  responsibleUserId: Uuid;
  responsibleUserName: string;
  enteredBy: Uuid;
  enteredByName: string;
  comment: string | null;
  status: ExpenseStatus;
  isReversed: boolean;
  reversalReason: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: OffsetDateTime;
  updatedAt: OffsetDateTime;
  audit: AuditEventDto[];
}

interface CreateExpenseRequest {
  transactionDate: DateOnly;
  /** Cashier uchun yuborilmaydi; global actor uchun backend scope tekshiradi. */
  branchId?: Uuid;
  categoryId: Uuid;
  description: string;
  amountUzs: PositiveMoneyUzs;
  paymentMethodId: Uuid;
  departmentId: Uuid;
  responsibleUserId: Uuid;
  comment?: string | null;
  idempotencyKey: string;
}

interface UpdateExpenseRequest {
  transactionDate?: DateOnly;
  categoryId?: Uuid;
  description?: string;
  amountUzs?: PositiveMoneyUzs;
  paymentMethodId?: Uuid;
  departmentId?: Uuid;
  responsibleUserId?: Uuid;
  comment?: string | null;
}

interface ReasonRequest {
  reason: string;
}
```

Create/update request quyidagilarni qabul qilmaydi: period ID, type/category snapshot, entered/approved/reversed actor, status va audit timestamp.

Expense list filter:

```ts
interface ExpenseListFilters {
  dateFrom?: DateOnly;
  dateTo?: DateOnly;
  year?: number;
  month?: number;
  branch?: Uuid | 'all';
  categoryId?: Uuid;
  expenseType?: ExpenseType;
  departmentId?: Uuid;
  paymentMethodId?: Uuid;
  responsibleUserId?: Uuid;
  enteredByUserId?: Uuid;
  status?: ExpenseStatus;
  sort?: 'transactionDate:desc' | 'transactionDate:asc';
  page?: number;
  pageSize?: number;
}
```

Server default sort: `transactionDate DESC`, `createdAt DESC`, `id DESC`.

## 8. Budget DTO

```ts
interface BudgetLineDto {
  id: Uuid;
  branchId: Uuid;
  branchName: string;
  categoryId: Uuid;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: ExpenseType;
  plannedAmountUzs: NonNegativeMoneyUzs | null;
  actualAmountUzs: MoneyUzs;
  varianceUzs: MoneyUzs | null;
  reason: string | null;
  hasPlan: boolean;
}

interface BudgetVersionDto {
  id: Uuid;
  periodId: Uuid;
  periodLabel: string;
  revisionNo: number;
  status: PlanStatus;
  reason: string | null;
  lines: BudgetLineDto[];
  createdByName: string;
  submittedByName: string | null;
  approvedByName: string | null;
  createdAt: OffsetDateTime;
}

interface BudgetLineInput {
  branchId: Uuid;
  categoryId: Uuid;
  /** null line yuborilmaydi/o‘chiriladi; "0" explicit zero plan. */
  plannedAmountUzs: NonNegativeMoneyUzs;
  reason?: string | null;
}

interface PutBudgetLinesRequest {
  lines: BudgetLineInput[];
}
```

No-plan mavjud line emas; `plannedAmountUzs: "0"` esa valid zero plan. Report DTO bu farqni `hasPlan` bilan ham ochiq beradi.

## 9. Revenue plan va transaction DTO

```ts
interface RevenuePlanDto {
  id: Uuid;
  periodId: Uuid;
  periodLabel: string;
  branchId: Uuid;
  branchName: string;
  revisionNo: number;
  status: PlanStatus;
  plannedAmountUzs: NonNegativeMoneyUzs;
  reason: string | null;
  submittedByName: string | null;
  approvedByName: string | null;
  updatedAt: OffsetDateTime;
}

interface CreateRevenuePlanRevisionRequest {
  periodId: Uuid;
  branchId: Uuid;
  plannedAmountUzs: NonNegativeMoneyUzs;
  reason: string;
}

type PaymentTimePrecision = 'exact' | 'date_only';

interface RevenueTransactionDto {
  id: Uuid;
  receiptNo: string;
  paymentAt: OffsetDateTime;
  paymentBusinessDate: DateOnly;
  timePrecision: PaymentTimePrecision;
  periodId: Uuid;
  branchId: Uuid;
  branchName: string;
  amountUzs: PositiveMoneyUzs;
  paymentMethodId: Uuid;
  paymentMethodName: string;
  collectorUserId: Uuid;
  collectorName: string;
  enteredBy: Uuid;
  enteredByName: string;
  enteredOnBehalf: boolean;
  onBehalfReason: string | null;
  externalReference: string | null;
  description: string;
  status: RevenueStatus;
  reversalReason: string | null;
  createdAt: OffsetDateTime;
  audit: AuditEventDto[];
}

interface CreateRevenueTransactionRequest {
  paymentAt: OffsetDateTime;
  amountUzs: PositiveMoneyUzs;
  paymentMethodId: Uuid;
  externalReference?: string | null;
  description: string;
  /** Cashier uchun yuborilmaydi; global actor uchun backend scope tekshiradi. */
  branchId?: Uuid;
  /** Faqat revenue.enter_on_behalf permission bilan. */
  collectorUserId?: Uuid;
  onBehalfReason?: string;
  idempotencyKey: string;
}
```

Collector berilmasa backend authenticated cashierni qo‘yadi. Boshqa collector bo‘lsa permission va non-empty sabab majburiy. Frontend actor/`enteredBy`ni yubormaydi.

Revenue filters:

```ts
interface RevenueListFilters {
  periodId?: Uuid;
  dateFrom?: DateOnly;
  dateTo?: DateOnly;
  branch?: Uuid | 'all';
  collectorUserId?: Uuid;
  enteredByUserId?: Uuid;
  paymentMethodId?: Uuid;
  status?: RevenueStatus;
  externalReference?: string;
  sort?: 'paymentAt:desc' | 'paymentAt:asc';
  page?: number;
  pageSize?: number;
}
```

Default sort: `paymentAt DESC`, `createdAt DESC`, `id DESC`.

## 10. Report DTO

```ts
interface AmountStateDto {
  amountUzs: MoneyUzs | null;
  hasData: boolean;
}

interface PlanActualDto {
  hasPlan: boolean;
  plannedAmountUzs: NonNegativeMoneyUzs | null;
  actualAmountUzs: NonNegativeMoneyUzs;
  varianceUzs: MoneyUzs | null;
  completionPercent: Percentage;
  status: 'no_plan' | 'unplanned' | 'under_plan' | 'on_plan' | 'over_plan';
}

interface RevenueKpiDto {
  planComplete: boolean;
  branchesWithPlan: number;
  expectedBranchCount: number;
  expectedRevenueUzs: NonNegativeMoneyUzs | null;
  actualRevenueUzs: NonNegativeMoneyUzs;
  shortfallUzs: NonNegativeMoneyUzs | null;
  overPlanUzs: NonNegativeMoneyUzs | null;
  collectionPercent: Percentage;
}

interface DashboardResponseDto {
  isDemo: boolean;
  period: AccountingPeriodDto;
  branchId: Uuid | null;
  expensePlanUzs: MoneyUzs;
  expenseActualUzs: MoneyUzs;
  expenseVarianceUzs: MoneyUzs;
  expenseCompletionPct: Percentage;
  revenuePlanUzs: MoneyUzs;
  revenueActualUzs: MoneyUzs;
  revenueGapUzs: MoneyUzs;
  revenueOverPlanUzs: MoneyUzs;
  collectionPct: Percentage;
  netResultUzs: MoneyUzs;
  netMarginPct: Percentage;
  fixedExpenseUzs: MoneyUzs;
  variableExpenseUzs: MoneyUzs;
  channels: Array<{ id: Uuid; name: string; amountUzs: MoneyUzs; sharePct: Percentage }>;
  monthlyTrend: Array<{ month: string; planUzs: MoneyUzs; actualUzs: MoneyUzs }>;
  branches: Array<{
    branchId: Uuid;
    name: string;
    planUzs: MoneyUzs;
    actualUzs: MoneyUzs;
    collectionPct: Percentage;
  }>;
  dataQuality: {
    status: 'healthy' | 'warning' | 'mismatch';
    openCount: number;
    excludedAmountUzs: MoneyUzs;
  };
}

interface MonthlyReportRowDto {
  category: HistoricalRefDto & { expenseTypeSnapshot: ExpenseType };
  months: Array<{ month: number; planActual: PlanActualDto; transactionCount: number }>;
  annual: PlanActualDto & { transactionCount: number };
}

interface MonthlyReportDto {
  year: number;
  branchFilter: Uuid | 'all';
  averagePolicy: {
    code: 'calendar_12' | 'elapsed_months' | 'months_with_actual';
    label: string;
    denominator: number;
  };
  rows: MonthlyReportRowDto[];
  totals: { fixed: PlanActualDto; variable: PlanActualDto; overall: PlanActualDto };
}

interface BranchSummaryDto {
  branch: HistoricalRefDto;
  expense: PlanActualDto;
  revenue: RevenueKpiDto;
}

interface BranchComparisonReportDto {
  year: number;
  months: Array<{ month: number; branches: BranchSummaryDto[]; total: BranchSummaryDto }>;
  annual: { branches: BranchSummaryDto[]; total: BranchSummaryDto };
}

interface ChannelSummaryDto {
  id: Uuid;
  paymentMethodId: Uuid;
  paymentMethodName: string;
  amountUzs: NonNegativeMoneyUzs;
  transactionCount: number;
  sharePercent: Percentage;
  drilldownFilters: Record<string, string>;
}

interface CashierSummaryDto {
  collectorUserId: Uuid;
  collectorName: string;
  branchId: Uuid;
  branchName: string;
  isActive: boolean;
  totalUzs: NonNegativeMoneyUzs;
  transactionCount: number;
  cashUzs: NonNegativeMoneyUzs;
  cardUzs: NonNegativeMoneyUzs;
  bankUzs: NonNegativeMoneyUzs;
  branchSharePct: Percentage;
}

interface RevenueReportDto {
  period: AccountingPeriodDto;
  branchFilter: Uuid | 'all';
  center: RevenueKpiDto;
  channels: ChannelSummaryDto[];
  branches: Array<{
    branchId: Uuid;
    branchName: string;
    kpi: RevenueKpiDto;
    channels: ChannelSummaryDto[];
  }>;
  reconciliation: ReconciliationResultDto;
}

interface ProfitLossReportDto {
  period: AccountingPeriodDto;
  branchFilter: Uuid | 'all';
  actualRevenueUzs: NonNegativeMoneyUzs;
  actualExpenseUzs: NonNegativeMoneyUzs;
  netFinancialResultUzs: MoneyUzs;
  netMarginPercent: Percentage;
  label: 'Foyda' | 'Zarar' | 'Nol natija';
}
```

Backend actual formulas va totalsni qaytaradi. Frontend `shortfall`, `net result`, shares yoki reconciliation totalni visible rows’dan authoritative qayta hisoblamaydi; faqat optional presentation sanity check qilishi mumkin.

Joriy developmentda shu “backend” rolini MSW bajaradi: handler current posted/non-reversed state va approved planlardan dashboard/revenue/cashier/monthly/branch/P&L response DTO’larini hosil qiladi. React komponentlari response’dagi total, percentage, `hasPlan`, `hasData` va semantic labelni render qiladi. Real backend ulangan deb da’vo qilinmaydi; production parity `FE-E2E-REAL`/`BE-INT` bilan tekshiriladi.

## 11. Data-quality, import va reconciliation DTO

```ts
type DqSeverity = 'info' | 'warning' | 'error';
type DqStatus = 'open' | 'resolved' | 'ignored';

interface DataQualityExceptionDto {
  id: Uuid;
  severity: DqSeverity;
  issueType: string;
  title: string;
  sourceSheet: string;
  sourceRow: number;
  branchId: Uuid | null;
  branchName: string | null;
  transactionDate: string | null;
  amountUzs: MoneyUzs;
  detail: string;
  ownerName: string | null;
  status: DqStatus;
  createdAt: OffsetDateTime;
}

interface ReconciliationResultDto {
  id: Uuid;
  scope: string;
  status: 'match' | 'mismatch';
  sourceCount: number;
  targetCount: number;
  diffCount: number; // source - target
  sourceSumUzs: MoneyUzs;
  targetSumUzs: MoneyUzs;
  diffSumUzs: MoneyUzs; // source - target
  checkedAt: OffsetDateTime;
}

interface ImportJobDto {
  id: Uuid;
  sourceName: string;
  status: 'preview_ready' | 'running' | 'completed' | 'failed';
  totalRows: number;
  normalizedRows: number;
  exceptionRows: number;
  recoveredAmountUzs: MoneyUzs;
  startedAt: OffsetDateTime | null;
  completedAt: OffsetDateTime | null;
  message: string;
}
```

Known acceptance fixture:

- Sayxun source `29 435 000`;
- Xalqlar source `22 998 400`, legacy Jurnal `16 680 000`, difference `6 318 400`;
- total source `52 433 400`, legacy Jurnal `46 115 000`;
- Xalqlar 43 text-date row har biri normalized yoki explicit exception bo‘lishi kerak.

## 12. Period close readiness DTO

```ts
interface CloseCheckDto {
  id: string;
  label: string;
  description: string;
  status: 'passed' | 'warning' | 'blocked';
  count?: number;
  amountUzs?: MoneyUzs;
}

interface PeriodCloseReadinessDto {
  period: AccountingPeriodDto;
  canClose: boolean;
  checks: CloseCheckDto[];
  snapshot: {
    id: Uuid;
    createdAt: OffsetDateTime;
    createdByName: string;
    expenseActualUzs: MoneyUzs;
    revenueActualUzs: MoneyUzs;
    netResultUzs: MoneyUzs;
    reconciliationStatus: 'match' | 'mismatch';
    artifacts: string[];
  } | null;
  history: PeriodStatusEventDto[];
}

interface ClosePeriodRequest {
  note: string;
}

interface ReopenPeriodRequest {
  reason: string;
}
```

Frontend readinessni o‘zi hisoblamaydi va clientdagi eski `canClose`ni POST qilmaydi. Close endpoint backendda qayta tekshiradi.

Joriy MSW flow stateful: legacy import job 43 text-date rowni normalizatsiya qiladi, explicit exception/DQ resolve reconciliationni va readinessni qayta hisoblaydi, initial blockerlar bartaraf bo‘lgach close bajariladi, approved planning yozuvlari lock qilinadi va reasonli close/reopen history saqlanadi. Bu in-memory development state; atomic DB transaction, cross-session consistency va durable archive snapshot emas.

Historical snapshot chegarasi:

- expense response’da category nomi va expense type snapshoti;
- budget/revenue planningda revision, reason, status va actor label’lari;
- revenue/cashier reportlarda collector/entered-by historical label’i;
- period detailda closure history.

Frontend bu qiymatlarni current master/user qiymati bilan almashtirmaydi. Joriy close handler dashboard-derived snapshotni in-memory saqlaydi va period detail uni ochib ko‘rsatadi. To‘liq immutable DB persistence hamda production archive endpoint kontrakti hanuz ochiq.

## 13. Audit va attachment DTO

```ts
type AuditLogDto = AuditEventDto;

/** V1.1 target; joriy frontend API’da attachment endpoint ulanmagan. */
interface AttachmentSummaryDto {
  id: Uuid;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  uploadedAt: OffsetDateTime;
  /** Private download URL talab qilinganda alohida short-lived endpoint beradi. */
}
```

Audit DTO serverda redacted bo‘lishi kerak. Joriy UI flat `actorId/actorName`, action, entity, result, reason va string change listini oladi; password hash, session token, signing key va boshqa secret qaytmasligi shart.

### 13.1 Joriy client/MSW endpoint xaritasi

Quyidagi pathlar hozir `src/shared/api/contracts.ts` va MSW handlerlarda real UI tomonidan ishlatiladi. Ularning mavjudligi production backend tasdiqlanganini anglatmaydi.

| Method | Current path | Joriy vazifa |
| --- | --- | --- |
| `GET` | `/users/directory` | scoped safe user projection |
| `GET` | `/admin/users` | `user.manage`li to‘liq admin list |
| `POST` | `/users` | admin user create |
| `PUT` | `/users/:id/access` | role/branch access update |
| `PATCH` | `/users/:id/status` | active/inactive/blocked transition |
| `GET` | `/revenue-plans/summary` | period planning summary |
| `GET` | `/imports/latest` | local latest import job |
| `POST` | `/imports/legacy-normalize` | local legacy normalization run |
| `POST` | `/data-quality-exceptions/:id/resolve` | reasonli DQ resolution |
| `GET` | `/reconciliations` | current reconciliation results |
| `GET` | `/periods/:id/readiness` | server/MSW-authoritative close checklist |
| `POST` | `/periods/:id/close` | readinessni qayta tekshirib close |
| `POST` | `/periods/:id/reopen` | majburiy sabab bilan reopen |

Real Google Sheets upload/preview/approve uchun TZdagi `/imports/sheets` yoki kelishilgan job API alohida kerak. Joriy `/imports/legacy-normalize` faqat deterministic mock acceptance helperidir.

## 14. TZ-tasdiqlangan endpointlar

`Auth`:

| Method | Path           | Request                    | Response                                          |
| ------ | -------------- | -------------------------- | ------------------------------------------------- |
| `POST` | `/auth/login`  | `{ login, password }`      | `AuthenticatedUserDto`                            |
| `POST` | `/auth/logout` | —                          | `204`                                             |
| `GET`  | `/me`          | —                          | `AuthenticatedUserDto`                            |

`Master data`:

| Method           | Path                      | Vazifa                        |
| ---------------- | ------------------------- | ----------------------------- |
| `GET/POST/PATCH` | `/master/categories`      | list/create/update category   |
| `GET/POST/PATCH` | `/master/departments`     | list/create/update department |
| `GET/POST/PATCH` | `/master/payment-methods` | list/create/update channel    |
| `GET`            | `/branches`               | user ko‘ra oladigan filiallar |

`Expenses`:

| Method  | Path                    | Request/response                                             |
| ------- | ----------------------- | ------------------------------------------------------------ |
| `GET`   | `/expenses`             | `ExpenseListFilters` → `PaginatedResponse<ExpenseDto>`       |
| `POST`  | `/expenses`             | `CreateExpenseRequest` → `ExpenseDto`; idempotency key       |
| `GET`   | `/expenses/:id`         | `ExpenseDto`                                                 |
| `PATCH` | `/expenses/:id`         | `UpdateExpenseRequest` → `ExpenseDto`                        |
| `POST`  | `/expenses/:id/correct` | `ReasonRequest` → corrected/reversal detail                  |
| `POST`  | `/expenses/:id/submit`  | optional version → detail                                    |
| `POST`  | `/expenses/:id/approve` | optional version → detail                                    |
| `POST`  | `/expenses/:id/reject`  | `ReasonRequest` → detail                                     |

`Budget`:

| Method | Path                                 | Request/response                             |
| ------ | ------------------------------------ | -------------------------------------------- |
| `GET`  | `/budget-periods/:periodId/versions` | `BudgetVersionDto[]`                         |
| `POST` | `/budget-periods/:periodId/versions` | `{ reason }` → `BudgetVersionDto`            |
| `PUT`  | `/budget-versions/:id/lines`         | `PutBudgetLinesRequest` → `BudgetVersionDto` |
| `POST` | `/budget-versions/:id/submit`        | optional version → `BudgetVersionDto`        |
| `POST` | `/budget-versions/:id/approve`       | optional version → `BudgetVersionDto`        |

`Reports`:

| Method | Path                         | Response                                                        |
| ------ | ---------------------------- | --------------------------------------------------------------- |
| `GET`  | `/reports/monthly`           | `MonthlyReportDto`                                              |
| `GET`  | `/reports/branch-comparison` | `BranchComparisonReportDto`                                     |
| `GET`  | `/reports/dashboard`         | `DashboardResponseDto`                                          |
| `GET`  | `/reports/data-quality`      | DQ summary/list                                                 |
| `GET`  | `/reports/revenue`           | `RevenueReportDto`                                              |
| `GET`  | `/reports/cashiers`          | period/filter/items/summaryli `CashierReportResponse`           |
| `GET`  | `/reports/profit-loss`       | `ProfitLossReportDto`                                           |

`Revenue`:

| Method | Path                                | Request/response                                      |
| ------ | ----------------------------------- | ----------------------------------------------------- |
| `GET`  | `/revenue-plans`                    | filters → `RevenuePlanDto[]`                          |
| `POST` | `/revenue-plans`                    | `CreateRevenuePlanRevisionRequest` → `RevenuePlanDto` |
| `POST` | `/revenue-plans/:id/approve`        | optional version → `RevenuePlanDto`                   |
| `GET`  | `/revenue-transactions`             | `RevenueListFilters` → paginated list                 |
| `POST` | `/revenue-transactions`             | create request → detail; idempotency key              |
| `GET`  | `/revenue-transactions/:id`         | `RevenueTransactionDto`                               |
| `POST` | `/revenue-transactions/:id/reverse` | `ReasonRequest` → detail                              |

`Period/audit/import`:

| Method | Path                  | Request/response                           |
| ------ | --------------------- | ------------------------------------------ |
| `POST` | `/periods/:id/close`  | `ClosePeriodRequest` → period/detail       |
| `POST` | `/periods/:id/reopen` | `ReopenPeriodRequest` → period/detail      |
| `GET`  | `/audit-logs`         | filters → `PaginatedResponse<AuditLogDto>` |
| `POST` | `/imports/sheets`     | upload/initiate import → job/preview       |

## 15. Taklif qilinadigan endpointlar — backend tasdig‘i kerak

Majburiy route’larni to‘liq ishlatish uchun:

| Method | Path | Sabab/current holat |
| --- | --- | --- |
| `GET` | `/periods` | current client/MSW period selector/archive list; backend tasdig‘i kerak |
| `GET` | `/periods/:id/readiness` | current client/MSW authoritative checklist path; backend tasdig‘i kerak |
| `GET` | `/budget-versions/:id` | current deep-link detail; backend tasdig‘i kerak |
| `POST` | `/budget-versions/:id/recall` | current clientda yo‘q; state machine qo‘llasa |
| `GET` | `/revenue-plans/:id` | current deep-link detail; backend tasdig‘i kerak |
| `GET` | `/revenue-plans/summary` | current period summary; backend tasdig‘i kerak |
| `POST` | `/revenue-plans/:id/submit` | current finance → director flow; backend tasdig‘i kerak |
| `POST` | `/revenue-plans/:id/recall` | current clientda yo‘q; state machine qo‘llasa |
| `POST` | `/data-quality-exceptions/:id/resolve` | current reasonli resolution path; backend tasdig‘i kerak |
| `GET` | `/reconciliations` | current current-state reconciliation; backend tasdig‘i kerak |
| `GET` | `/imports/latest` | current local job; production job/history contracti kerak |
| `POST` | `/imports/legacy-normalize` | current deterministic mock-only action; production endpoint sifatida qabul qilinmaydi |
| `GET/POST` | `/admin/users`, `/users` | current list/create split; backend bilan unifikatsiya/tasdiq kerak |
| `PUT/PATCH` | `/users/:id/access`, `/users/:id/status` | current admin mutations; backend tasdig‘i kerak |
| `GET/PUT` | `/roles/permissions`, `/roles/:role/permissions` | current role permission map; backend tasdig‘i kerak |
| `GET` | `/users/directory` | current safe selector projection; backend security testi kerak |
| `POST` | `/exports` | current clientda yo‘q; async export job |
| `GET` | `/exports/:id` | current clientda yo‘q; progress/status |
| `GET` | `/exports/:id/download` | current clientda yo‘q; authorized short-lived download |

V1 `/settings/branches` yangi branch yaratmaydi. `GET /branches` yetarli bo‘lsa route read-only; POST/PATCH branch endpointi scope’ga avtomatik qo‘shilmaydi.

## 16. HTTP status va error code katalogi

|   HTTP | Code                      | Frontend xulqi                                |
| -----: | ------------------------- | --------------------------------------------- |
|  `400` | `VALIDATION_ERROR`        | field va form summary                         |
|  `401` | `UNAUTHENTICATED`         | session clear, login’ga qaytish               |
|  `403` | `FORBIDDEN`               | access denied, session saqlanadi              |
|  `403` | `BRANCH_SCOPE_DENIED`     | branch-specific xabar, form data saqlanadi    |
|  `404` | `NOT_FOUND`               | route/entity not-found                        |
|  `409` | `PERIOD_CLOSED`           | mutation bloklangan, period badge/CTA         |
|  `409` | `REVISION_CONFLICT`       | reload/compare, silent overwrite yo‘q         |
|  `409` | `DUPLICATE_REFERENCE`     | reference conflict va existing ID bo‘lsa link |
|  `409` | `RECONCILIATION_MISMATCH` | close/import blokeri va drill-down            |
|  `422` | `INVALID_DATE`            | typed date xatosi                             |
|  `422` | `INVALID_COLLECTOR`       | on-behalf/cashier error                       |
|  `429` | `RATE_LIMITED`            | retry-after ko‘rsatish                        |
| `500+` | `INTERNAL_ERROR`          | request ID bilan generic error                |

Masalan:

```json
{
  "code": "PERIOD_CLOSED",
  "message": "2026-08 davri yopilgan; xarajatni tahrirlab bo'lmaydi.",
  "details": { "periodId": "..." },
  "requestId": "..."
}
```

## 17. Cache va invalidation kontrakti

| Mutation | Joriy client invalidatsiyasi | Production contractda qolgan |
| --- | --- | --- |
| expense create/update/correct | `expenses`, affected detail, `dashboard`, barcha `report` namespace’i | DQ/readiness parity real backend response bilan tekshiriladi |
| budget line/submit/approve/revision | budget list/detail, `dashboard`, `report`, `revenue-plan-summary`, `period-readiness` | concurrency/version conflict real backendda |
| revenue create/reverse | revenue list/detail, `dashboard`, barcha `report` namespace’i | reconciliation/readiness event/refetch siyosati backend bilan yakunlanadi |
| revenue plan create/submit/approve | plan list/detail, `dashboard`, `report`, `revenue-plan-summary`, `period-readiness` | real approved-plan aggregate parity |
| master data change | master list/selectors va `report` | historical fact snapshot live master bilan overwrite qilinmaydi |
| period close/reopen | period readiness/detail va period list | affected screen capability/report invalidatsiyasi real API contract bilan kengaytiriladi |
| DQ resolve/import | `data-quality`, `imports`, `reconciliations`, `period-readiness` | real ledger/report invalidatsiyasi import commit natijasiga bog‘liq |
| user/role change | admin list, safe directory; role/current user bo‘lsa `/me` | production session invalidation policy |

Revenue create/reversal E2E report va dashboardni qayta ochib canonical net qiymat qaytganini tekshiradi. Query invalidation backend aggregate’ni to‘g‘ri qiladi degani emas; u faqat stale frontend cache saqlanib qolmasligini ta’minlaydi.

## 18. MSW contract fixtures

Development-only identity:

- Xalqlar cashier;
- finance manager + Sayxun cashier;
- director.

Acceptance fixturelar:

- Sayxun revenue plan `160000000`, actual `150000000`, shortfall `10000000`, collection `93.75`;
- center plan `300000000`, actual `180000000`, shortfall `120000000`, collection `60`;
- Sayxun channel: cash `60000000`, card `50000000`, bank `40000000`;
- cashier A `70000000`, cashier B `80000000`;
- DQ difference `6318400` va 43 text-date row;
- zero plan, missing plan va no data alohida;
- reversed transaction;
- closed period;
- inactive historical category va revoked cashier.
- finance+kassir uchun read-all/write-only-Sayxun scope;
- safe directory va blocked user;
- stateful import/DQ/readiness/close/reopen;
- expense/revenue idempotency key replay.

Fixture komponent ichida hardcode qilinmaydi. Handler query filter, pagination, sort, scope, status transition va error scenario’ni real kontrakt kabi bajaradi.

## 19. Kontrakt Definition of Done

- frontend va mock bitta TypeScript DTO boundary’dan foydalanadi;
- generic client error, money/date/timestamp/percentage invariantlarini runtime tekshiradi; full per-endpoint Zod schema hali backlog;
- password hash yoki secret biror DTO’da yo‘q;
- safe directory admin projectiondan ajratilgan va permission/scope/phone siz qaytadi;
- read `branchScopes` va write `writeBranchScopes` mutationlarda aralashtirilmaydi;
- barcha mutation server-derived fieldlarni requestdan chiqaradi;
- `MoneyUzs`, percentage va timestamp semanticasi testlangan;
- confirmed/taklif endpoint farqi backend bilan kelishilgan;
- URL filter va API filter bitta parserdan foydalanadi;
- error katalogi backend bilan contract-test orqali tekshiriladi;
- API pagination 500 qatordan katta datasetda transaction yo‘qotmaydi;
- `hasPlan`, `hasData`, DQ va historical snapshot ma’nolari saqlanadi;
- report aggregate frontend visible rowlaridan canonical qayta hisoblanmaydi;
- cache invalidation mutation ta’sir qilgan list/detail/report/readiness namespace’larini stale qoldirmaydi;
- production archive snapshot, idempotency va reconciliation persistence real backend/DB bilan tekshiriladi;
- real backend contract test o‘tmaguncha faqat MSW natijasi production-ready deb belgilanmaydi.
