# PHASE 18.0 — Frontend → Backend Mapping Audit

**Type:** Read / analyze / map. No code, no project, no migration, no schema change, no frontend change, no contract change, no document rewrite.
**Date:** 2026-08-23
**Priority applied:** actual frontend calls → `contracts.ts` → `handlers.ts` → domain types → route/page usage → `FRONTEND_API_CONTRACT.md` → `DATABASE_ARCHITECTURE.md` → older audits.

---

## 1. Executive Summary

The running frontend calls **40 endpoints**. Every one of them is declared in `src/shared/api/contracts.ts` and implemented in `src/mocks/handlers.ts` — parity is exact in all three directions, and **there is no dead contract surface**: all 40 are reached from at least one screen.

That makes this phase unusually clean. Unlike Phase 17.1 — which found three competing architectural stacks — the *practical* integration target is unambiguous: **whatever the frontend calls today is the backend's job**.

Key numbers:

| | |
|---|---|
| Active endpoints (called by a screen) | **40** |
| Declared but unused | **0** |
| UI without API | **1** (attachments placeholder, intentional) |
| Application routes | 20 + 404 |
| Required NestJS modules | **12** (9 feature + 3 infrastructure) |
| Modules with a clean database target | **7** |
| Partial modules | **4** |
| Blocked modules | **1** (Revenue) |

The single blocker is unchanged from Phase 17.1 and is not re-litigated here: **the daily-revenue grain has no table in any candidate schema**. Everything else can be built against the existing schema with ordinary mapping work.

Break-even is **not implemented in the frontend at all** — no route, no type, no API call. It is recorded here as DATABASE READY / FRONTEND NOT IMPLEMENTED / API MISSING and is **not** added to the backend scope.

---

## 2. Audit Scope

In scope: what the frontend actually calls, which screen calls it, which MSW handler answers, which business rule that handler enforces, which NestJS module and database entity should own it, and in what order to build.

Out of scope: resolving the 55-vs-40 endpoint conflict from Phase 17.1, choosing a schema, inventing endpoints, or adding features.

---

## 3. Files Inspected

| File | How | Purpose |
|---|---|---|
| `src/shared/api/contracts.ts` | Full | Endpoint declarations, DTO types |
| `src/mocks/handlers.ts` | Structural extraction — 40 routes, guards, error codes | Reference implementation |
| `src/shared/types/domain.ts` | Full | Domain models. **Note:** the brief refers to `src/shared/domain.ts`; the actual path is `src/shared/types/domain.ts` |
| `src/app/app-router.tsx` | Full | Route → page mapping |
| `src/shared/config/routes.ts` | Full | Route constants + permission-gated navigation |
| `src/features/**/*.tsx` | Targeted grep for `*Api.` usage only — no component read end-to-end | Screen → endpoint attribution |
| `src/features/admin/settings-pages.tsx` | Targeted — `kind`/`canManage` logic | Branch read-only confirmation |
| `src/features/auth/auth-context.tsx` | Targeted — `mutationFn` references | Auth flow |
| `docs/DATABASE_ARCHITECTURE.md` + `001_reference_schema.sql` | Table/column inventory (from Phase 17, not re-read) | Entity mapping |
| `docs/database/003_report_and_reconciliation_queries.sql` | View inventory (from Phase 17, not re-read) | Report mapping |

Not inspected: `node_modules`, `dist`, `.git`, CSS/assets, individual UI components, Figma, network. Phases 15–17 documents were **not** re-audited; their conclusions are cited, not recomputed.

---

## 4. API Inventory

### 4.1 Active Endpoints

All 40 are reached from at least one screen. "Screen/Feature" lists the calling file(s) relative to `src/`.

| # | Method | Endpoint | Used in FE | contracts.ts | MSW handler | Screen / Feature |
|---|---|---|---|---|---|---|
| 1 | POST | `/auth/login` | ✔ | ✔ | ✔ | `features/auth/auth-context.tsx` (`mutationFn: authApi.login`) |
| 2 | POST | `/auth/logout` | ✔ | ✔ | ✔ | `features/auth/auth-context.tsx` |
| 3 | GET | `/me` | ✔ | ✔ | ✔ | auth-context, BudgetPages, ExpensePages, ImportPage, RevenuePages |
| 4 | GET | `/branches` | ✔ | ✔ | ✔ | app-shell, settings-pages, users-page, dashboard, ExpensePages, ImportPage, CashierReportPage, FinancialReportPages, RevenuePages |
| 5 | GET | `/periods` | ✔ | ✔ | ✔ | app-shell, BudgetPages, dashboard, ExpensePages, NotificationsPage, CashierReportPage, RevenuePages |
| 6 | GET | `/master/categories` | ✔ | ✔ | ✔ | settings-pages, ExpensePages, ImportPage |
| 7 | GET | `/master/departments` | ✔ | ✔ | ✔ | settings-pages, ExpensePages, ImportPage |
| 8 | GET | `/master/payment-methods` | ✔ | ✔ | ✔ | settings-pages, ExpensePages, ImportPage |
| 9 | GET | `/users/directory` | ✔ | ✔ | ✔ | ExpensePages, ImportPage, NotificationsPage |
| 10 | POST | `/master/:kind` | ✔ | ✔ | ✔ | `features/admin/settings-pages.tsx` (`adminApi.createMaster<SettingRow>`) |
| 11 | PATCH | `/master/:kind/:id` | ✔ | ✔ | ✔ | `features/admin/settings-pages.tsx` |
| 12 | GET | `/expenses` | ✔ | ✔ | ✔ | `features/expenses/ExpensePages.tsx` — ExpenseLedgerPage |
| 13 | GET | `/expenses/:id` | ✔ | ✔ | ✔ | ExpensePages — ExpenseDetailPage |
| 14 | POST | `/expenses` | ✔ | ✔ | ✔ | ExpensePages — ExpenseCreatePage (`mutationFn: expenseApi.create`) |
| 15 | PATCH | `/expenses/:id` | ✔ | ✔ | ✔ | ExpensePages — ExpenseEditForm |
| 16 | GET | `/daily-revenues` | ✔ | ✔ | ✔ | `features/revenue/RevenuePages.tsx` — RevenueLedgerPage |
| 17 | GET | `/daily-revenues/:id` | ✔ | ✔ | ✔ | RevenuePages — RevenueDetailPage |
| 18 | POST | `/daily-revenues` | ✔ | ✔ | ✔ | RevenuePages — RevenueCreatePage |
| 19 | PATCH | `/daily-revenues/:id` | ✔ | ✔ | ✔ | RevenuePages — RevenueEditForm |
| 20 | GET | `/revenue-plans/:periodId` | ✔ | ✔ | ✔ | RevenuePages — RevenuePlanPage |
| 21 | PUT | `/revenue-plans/:periodId` | ✔ | ✔ | ✔ | RevenuePages — RevenuePlanPage |
| 22 | GET | `/budget-plans/:periodId` | ✔ | ✔ | ✔ | `features/budgets/BudgetPages.tsx` |
| 23 | PUT | `/budget-plans/:periodId/lines` | ✔ | ✔ | ✔ | BudgetPages |
| 24 | GET | `/reports/dashboard` | ✔ | ✔ | ✔ | `features/dashboard/dashboard-page.tsx` |
| 25 | GET | `/reports/monthly` | ✔ | ✔ | ✔ | `features/reports/FinancialReportPages.tsx` |
| 26 | GET | `/reports/branch-comparison` | ✔ | ✔ | ✔ | FinancialReportPages |
| 27 | GET | `/reports/cashiers` | ✔ | ✔ | ✔ | `features/reports/CashierReportPage.tsx` |
| 28 | POST | `/imports/expenses` | ✔ | ✔ | ✔ | `features/imports/ImportPage.tsx` |
| 29 | GET | `/notifications/telegram` | ✔ | ✔ | ✔ | `features/notifications/NotificationsPage.tsx` |
| 30 | PUT | `/notifications/telegram` | ✔ | ✔ | ✔ | NotificationsPage |
| 31 | GET | `/notifications/reminder-preview` | ✔ | ✔ | ✔ | NotificationsPage |
| 32 | GET | `/notifications/monthly-preview` | ✔ | ✔ | ✔ | NotificationsPage |
| 33 | POST | `/notifications/telegram/test` | ✔ | ✔ | ✔ | NotificationsPage |
| 34 | GET | `/admin/users` | ✔ | ✔ | ✔ | `features/admin/users-page.tsx` |
| 35 | POST | `/users` | ✔ | ✔ | ✔ | users-page — CreateUserPanel |
| 36 | PUT | `/users/:id/access` | ✔ | ✔ | ✔ | users-page — EditUserAccessPanel |
| 37 | PATCH | `/users/:id/status` | ✔ | ✔ | ✔ | users-page — UserStatusAction |
| 38 | PATCH | `/users/:id/salary` | ✔ | ✔ | ✔ | users-page — SalaryCell |
| 39 | GET | `/roles/permissions` | ✔ | ✔ | ✔ | `features/admin/roles-page.tsx` |
| 40 | PUT | `/roles/:role/permissions` | ✔ | ✔ | ✔ | roles-page |

**Route inventory (20 + 404).** `FILE: src/app/app-router.tsx`, `FILE: src/shared/config/routes.ts`

`/login` · `/dashboard` · `/expenses` · `/expenses/new` · `/expenses/:expenseId` · `/revenue` · `/revenue/new` · `/revenue/plans` · `/revenue/:revenueId` · `/budgets` · `/reports/monthly` · `/reports/branches` · `/reports/cashiers` · `/settings/categories` · `/settings/departments` · `/settings/payment-methods` · `/settings/branches` · `/settings/import` · `/settings/notifications` · `/admin/users` · `/admin/roles`

### 4.2 Declared but Unused Endpoints

**None.** All 40 declarations in `contracts.ts` are invoked.

Six functions initially appeared unused under a naive `fn(` scan; all six are genuinely used and were verified individually:

| Function | Why it looked unused | Evidence |
|---|---|---|
| `authApi.login` | passed as a reference | `FILE: src/features/auth/auth-context.tsx` L35 `mutationFn: authApi.login,` |
| `authApi.logout` | passed as a reference | same file, L39 |
| `expenseApi.create` | passed as a reference | `FILE: src/features/expenses/ExpensePages.tsx` L516 |
| `revenueApi.create` | passed as a reference | `FILE: src/features/revenue/RevenuePages.tsx` L405 |
| `adminApi.createMaster` | generic call `fn<T>(…)` | `FILE: src/features/admin/settings-pages.tsx` L212 |
| `adminApi.updateMaster` | generic call `fn<T>(…)` | same file, L301 |

### 4.3 UI Without API

| Screen element | Location | Status |
|---|---|---|
| **Attachments card** ("Biriktirmalar — Receipt, invoice va foto oqimi V1.1 doirasida") | `FILE: src/features/expenses/ExpensePages.tsx` — ExpenseDetailPage, renders an `EmptyState` | **UI WITHOUT API — intentional placeholder.** DB has an `attachments` table; no endpoint in `contracts.ts`. Out of V1 scope; **do not** implement in Phase 18 |

Two screens were checked and are **not** UI-without-API:

- `LoginPage` (`FILE: src/features/auth/login-page.tsx`) has no direct `*Api.` call because it goes through `useAuth().login` → `auth-context.tsx` → `authApi.login`. Correctly wired.
- `BranchesPage` (`FILE: src/features/admin/settings-pages.tsx` L395, `<SettingsPage kind="branches" />`) is **deliberately read-only**: `canManage = kind !== 'branches' && hasPermission('master_data.manage')` (L68), and the mutation panels are typed `Exclude<SettingKind, 'branches'>` (L202, L290). It reads `GET /branches` and offers no CRUD **by design** — consistent with DECISION-A ("no add-branch admin UI in V1"). Not a gap.

No screen exists for break-even, profit/loss, audit log, period closing, reconciliation or data-quality — those features are absent from the frontend entirely, so they generate no backend requirement in this phase.

---

## 5. Frontend Feature → Backend Module Mapping

Derived only from features that actually exist in the running app.

| Frontend feature | Required NestJS module | Priority | Evidence |
|---|---|---|---|
| Login / session / current user | **AuthModule** | 1 | `auth-context.tsx`; endpoints 1–3 |
| Role & permission matrix editor | **RbacModule** | 2 | `roles-page.tsx`; endpoints 39–40 |
| Branch selector (top bar, filters), read-only branch settings | **BranchesModule** | 3 | `app-shell.tsx`, `settings-pages.tsx`; endpoint 4 |
| Period selector, closed-period enforcement | **AccountingPeriodsModule** | 3 | `app-shell.tsx`, all write screens; endpoint 5 |
| Categories / departments / payment methods CRUD | **MasterDataModule** | 3 | `settings-pages.tsx`; endpoints 6–8, 10–11 |
| User directory, admin user list, access, status, salary | **UsersModule** | 4 | `users-page.tsx`; endpoints 9, 34–38 |
| Expense ledger, create, detail, edit | **ExpensesModule** | 5 | `ExpensePages.tsx`; endpoints 12–15 |
| Daily revenue ledger, create, detail, edit + revenue plan | **RevenueModule** | 6 | `RevenuePages.tsx`; endpoints 16–21 |
| Budget matrix | **BudgetsModule** | 6 | `BudgetPages.tsx`; endpoints 22–23 |
| Dashboard, monthly, branch comparison, cashier report | **ReportsModule** | 7 | `dashboard-page.tsx`, `FinancialReportPages.tsx`, `CashierReportPage.tsx`; endpoints 24–27 |
| Excel import | **ImportsModule** | 8 | `ImportPage.tsx`; endpoint 28 |
| Telegram settings & previews | **NotificationsModule** | 8 | `NotificationsPage.tsx`; endpoints 29–33 |

**No BreakEvenModule** — no frontend feature exists.
**No ApprovalsModule / MonthlyClosingModule / AuditModule (as a controller)** — no frontend feature exists. `AuditModule` is still required as *infrastructure* (see §11), because the database expects audit rows even though no screen reads them.

---

## 6. MSW Business Logic Inventory

`FILE: src/mocks/handlers.ts` throughout. Layer = where the rule belongs in NestJS.

### 6.1 Validation Rules

| Rule ID | Source symbol | Endpoint | Description | Layer |
|---|---|---|---|---|
| VAL-01 | `isPositiveMoney` | POST/PATCH `/expenses` | Amount must be a positive integer string (no decimals, no exponent) → 422 `AMOUNT_INVALID` | DTO Validation + Database Constraint (`uzs_amount_positive`) |
| VAL-02 | `isNonNegativeMoney` | PUT `/budget-plans/:periodId/lines`, PUT `/revenue-plans/:periodId`, PATCH `/users/:id/salary` | Amount may be `0` but not negative/null-invalid → 422 | DTO Validation + Database Constraint |
| VAL-03 | `findPeriodForBusinessDate` | POST/PATCH `/expenses`, POST `/daily-revenues` | Date must be a real calendar date **and** belong to an existing period → 422 `DATE_OR_PERIOD_INVALID` | Service |
| VAL-04 | POST `/daily-revenues` inline | POST `/daily-revenues` | `cash + card + transfer` must be > 0; each part non-negative | DTO Validation + Service |
| VAL-05 | POST/PATCH `/master/:kind` | 10, 11 | `code` and `name` required; `code` uppercased and unique case-insensitively → 409 `DUPLICATE_REFERENCE` | DTO Validation + Database Constraint |
| VAL-06 | POST `/users` | 35 | `fullName` ≥ 3 chars; phone unique after digit-normalisation → 409 | DTO Validation + Database Constraint |
| VAL-07 | PUT `/notifications/telegram` | 30 | `reminderTimeLocal` matches `HH:mm`; `monthlyReportDay` ∈ 1…28 → 422 | DTO Validation |
| VAL-08 | POST `/notifications/telegram/test` | 33 | `chatId` matches `^-?\d{5,}$` → 422 `CHAT_ID_INVALID` | DTO Validation |
| VAL-09 | POST `/expenses`, POST `/daily-revenues` | 14, 18 | `Idempotency-Key` header must equal `body.idempotencyKey` → 422 `IDEMPOTENCY_KEY_REQUIRED` | Controller |
| VAL-10 | POST/PATCH `/expenses` | 14, 15 | Category, payment method and department must exist **and be active** → 422 `REFERENCE_INVALID` | Service |
| VAL-11 | POST `/imports/expenses` | 28 | `rows` must be a non-empty array → 422 `IMPORT_EMPTY`; each row re-validated individually | DTO Validation + Service |

### 6.2 Authorization Rules

| Rule ID | Source symbol | Endpoint(s) | Description | Layer |
|---|---|---|---|---|
| AUZ-01 | `requireUser` | all except login | No session → 401 `UNAUTHENTICATED`; account no longer `active` → 401 `ACCOUNT_DISABLED` (re-checked **every request**) | Guard |
| AUZ-02 | `hasPermission` | 10–11, 14–15, 18–19, 20–23, 24–28, 29–33, 34–40 | Single required permission → 403 `PERMISSION_DENIED` | Guard |
| AUZ-03 | `hasAnyPermission` | 12–13, 16–17, 27 | OR-semantics across two permissions | Guard |
| AUZ-04 | `canUseBranch` | 4, 13, 17, 24, 25, 26, 27 | Read scope: branch must be in `branchScopes` → 403 `BRANCH_SCOPE_DENIED` | Guard |
| AUZ-05 | `canWriteBranch` | 14, 15, 18, 19, 28 | Write scope: branch must be in `writeBranchScopes` → 403 | Guard |
| AUZ-06 | `scopedBranchFilter` | 24, 25, 26, 27 | `branch=all` silently narrows to the single scope when the user has only one | Service |
| AUZ-07 | `hasRole(actor,'director')` | 35, 36, 40 | Only a director may grant/modify the `director` role or change role→permission grants → 403 `PRIVILEGE_ESCALATION_DENIED` | Guard |
| AUZ-08 | PUT `/users/:id/access`, PATCH `/users/:id/status` | 36, 37 | Last **active** director cannot lose the role or be deactivated → 409 `LAST_DIRECTOR_REQUIRED` | Service (invariant) |
| AUZ-09 | PUT `/users/:id/access` | 36 | `director` cannot be combined with another role → 422 `ROLE_COMBINATION_INVALID`; duplicate role → 409 `DUPLICATE_ROLE` | Service |
| AUZ-10 | PUT `/users/:id/access` | 36 | Cashier requires an **active** branch; center roles require `branchId = null` → 422 `ROLE_SCOPE_INVALID` | Service |
| AUZ-11 | GET `/users/directory` | 9 | Safe projection only — `id, fullName, status, roles`; never phone, permissions, scopes or salary | Service (explicit DTO) |
| AUZ-12 | GET `/reports/cashiers` | 27 | Without `reports.view_cashiers`, rows are filtered to the requester (`scope:'own'`) — other salaries never enter the response | Report Query |
| AUZ-13 | GET `/notifications/telegram` | 29 | Bot token never returned; only `botTokenSet: boolean` | Service (explicit DTO) |

### 6.3 Business Rules

| Rule ID | Source symbol | Endpoint(s) | Description | Layer |
|---|---|---|---|---|
| BR-01 | `findPeriodForBusinessDate` | 14, 15, 18, 19, 28 | Accounting period is **derived server-side** from the business date; never accepted from the client | Service |
| BR-02 | period `status` check | 14, 18, 28 | Write to a closed period → 409 `PERIOD_LOCKED` | Guard + Database Constraint |
| BR-03 | PATCH `/expenses/:id` | 15 | **Both** the old and the new period must be open | Service |
| BR-04 | PUT `/budget-plans/…`, PUT `/revenue-plans/…` | 21, 23 | Closed period → 409 `PERIOD_CLOSED` | Guard |
| BR-05 | `expenseIdempotency` / `revenueIdempotency` | 14, 18 | Replay of the same key returns the original row with **200** (not 201) | Service + Database Constraint (unique index) |
| BR-06 | POST `/expenses` | 14 | Category code, name and expense type are **snapshotted** onto the row at write time | Service |
| BR-07 | PATCH `/expenses/:id` | 15 | `id`, `branchId`, `enteredBy` are immutable on edit | Service |
| BR-08 | POST `/daily-revenues` | 18 | One row per `(branchId, businessDate)`; second attempt → 409 `REVENUE_DAY_EXISTS` with the existing id | Service + Database Constraint (unique) |
| BR-09 | POST `/daily-revenues` | 18 | `totalUzs` is **computed** from cash+card+transfer, never accepted from the client | Service |
| BR-10 | PATCH `/daily-revenues/:id` | 19 | Date, branch and period are immutable; only amounts and comment change | Service |
| BR-11 | `buildBudgetPlan` | 22 | `hasPlan=false` ("no plan line") and `plannedAmountUzs='0'` ("zero plan") are **different states**; no-plan yields `null` variance and `—` completion | Service + Report Query |
| BR-12 | `buildBudgetPlan` | 22, 24, 25 | `actualAmountUzs` is always computed from expenses, never stored | Report Query |
| BR-13 | `buildRevenuePlanBoard` | 20 | `dailyPlanUzs` = monthly plan ÷ days-in-month, computed, never stored | Service |
| BR-14 | `distributeDaily` | 24 | Monthly plan splits across days **with no remainder** — Σ daily = monthly exactly | Service |
| BR-15 | `buildTrends` | 24 | Weekly buckets are fixed day-ranges 1–7, 8–14, 15–21, 22–28, 29–end | Service |
| BR-16 | `buildAnnualSummary` | 24 | Average monthly expense uses **months with actual data only** as the denominator, not 12 | Report Query |
| BR-17 | `buildAnnualSummary` | 24 | Fixed-cost share, peak month and the 12-row dynamics table (Excel `Xulosa` parity) | Report Query |
| BR-18 | `buildCashierReport` | 27 | Branch revenue plan is split **evenly among active cashiers only**, with no remainder; inactive staff get no plan but keep historical revenue | Report Query |
| BR-19 | POST `/imports/expenses` | 28 | Dedupe by `(sourceSheet, sourceRow)` — already-imported pairs are **skipped**, not duplicated | Service + Database Constraint |
| BR-20 | POST `/imports/expenses` | 28 | Per-row rejection with a reason; the batch still commits the valid rows | Transaction |
| BR-21 | `publicTelegramSettings` | 29, 30 | Token is write-only; stored server-side, returned only as a boolean | Service |
| BR-22 | `findMissingRevenueBranches` | 31 | A branch with a `0` revenue row counts as **entered**; only a missing row triggers a reminder | Service |
| BR-23 | PUT `/roles/:role/permissions` | 40 | Changing a role recomputes **every** affected user's effective permissions and refreshes the caller's session | Service |
| BR-24 | master `PATCH` | 11 | Soft delete only (`isActive=false`); no hard delete exists anywhere in the contract | Service |

**Explicitly MOCK-ONLY (do not port):** plaintext `demo123` comparison; `sessionStorage` session; `exp-mock-N` / `rev-mock-N` id generation; `GET /reports/branch-comparison` returning hardcoded monthly figures rather than reading the ledger; `POST /notifications/telegram/test` returning `{delivered:false, note:'DEMO_NO_BACKEND'}`; all seeded fixture amounts.

**Notable absence:** the mock writes **no audit rows at all**, while the database provides `audit_logs` for exactly this purpose. Recorded as OD-05.

---

## 7. API Contract Analysis

### 7.1 Contract Ready

Directly implementable — request shape, response shape and database source are all unambiguous. **28 endpoints:** 1–15, 20–27 (except 27's salary field), 34–40.

Characteristics: response DTOs are fully typed in `domain.ts`; MSW returns exactly those shapes; every field maps to a column, a JOIN or a documented computation.

### 7.2 Contract Gaps

| ID | Endpoint | Gap |
|---|---|---|
| CG-01 | GET `/reports/dashboard` | `granularity` ∈ `daily\|weekly\|monthly` is a query parameter with no view behind it. Weekly bucketing (BR-15) and the annual block (BR-16/17) are service composition the backend must write from scratch. Shape is known; the **source** is not pre-built |
| CG-02 | GET `/notifications/reminder-preview` | Returns a fully-rendered Uzbek message string built by `buildReminderMessage`. The backend must reproduce the exact text, or the preview and the eventual delivery diverge. Message templates are currently frontend source, not data |
| CG-03 | POST `/notifications/telegram/test` | No success contract exists — the mock only ever returns `delivered:false`. What a real successful send returns is undefined |
| CG-04 | POST `/imports/expenses` | Request carries rows already parsed **in the browser** (`exceljs`). Whether the backend should accept pre-parsed rows or the raw file is unresolved (Phase 17.1 DEC-05) |

### 7.3 Type Mismatches

Naming-only differences (`branchId` ↔ `branch_id`, `amountUzs` ↔ `amount_uzs`) are **NORMAL MAPPING** and are not listed. Genuine mismatches:

| ID | Frontend type | Database | Nature |
|---|---|---|---|
| TM-01 | `MoneyUzs = string` everywhere | `BIGINT` / `uzs_amount_positive` domain | **Deliberate**, not a defect — avoids JS float/`Number.MAX_SAFE_INTEGER` loss. Backend must serialise as string, never as a JS number. `toChartNumber()` throws above the safe range, proving the frontend depends on this |
| TM-02 | `Branch.code: 'SAYXUN' \| 'XALQLAR'` | `branches.code TEXT` | Frontend narrows a dynamic column to a literal union. Harmless at 2 branches; a third branch would require a frontend type change |
| TM-03 | `Expense` has no `status` field | `expenses.status` is `NOT NULL` | The DTO omits a required column — the backend must supply a server-side default |
| TM-04 | `BudgetLine.plannedAmountUzs: MoneyUzs \| null` | `budget_lines.planned_amount_uzs NOT NULL` | `null` must map to **row absence**, not a nullable column (BR-11 depends on this) |
| TM-05 | `DailyRevenue.totalUzs` returned | no column | Computed field on an entity that has no table |

### 7.4 Database Gaps

| ID | Endpoint(s) | Gap | Severity |
|---|---|---|---|
| DG-01 | 16–19 (+24, 31 downstream) | **No table for daily revenue** (branch × day, channel split, unique per day). `revenue_transactions` is per-payment; `revenue_records` (PHASE_16) is per-period and absent from the SQL | **BLOCKER** |
| DG-02 | 27, 34, 35, 38 | `users` has **no** `fixed_salary_uzs` column | HIGH |
| DG-03 | 29–33 | No relational home for per-user Telegram `chatId`; only `system_settings(key, value JSONB)` exists | MEDIUM |
| DG-04 | 22–23 | `budget_lines.planned_amount_uzs NOT NULL` vs the no-plan state (TM-04) | MEDIUM — solvable by row absence, no schema change |
| DG-05 | 14, 28 | No unique index on `expenses.idempotency_key` or on `(source_sheet, source_row)` — BR-05/BR-19 are application-enforced only | LOW |

---

## 8. Frontend → Database Mapping

| Frontend entity | API DTO | Database table / view | Status |
|---|---|---|---|
| `AuthenticatedUser` | `AuthenticatedUser` | `users` + `user_roles` + `roles` + `role_permissions` + `permissions` | **PARTIAL** — `fixedSalaryUzs` has no column (DG-02) |
| `UserDirectoryItem` | `UserDirectoryItem` | `users` + `user_roles` (safe projection) | READY |
| `RoleAssignment` | nested in user | `user_roles` (+ `roles`) | READY — MAPPING REQUIRED (`roleName` from JOIN) |
| `RolePermissionMatrix` | `RolePermissionMatrix` | `role_permissions` | READY |
| `PermissionCode` (20 codes) | `permissions[]` | `permissions.code` | **PARTIAL** — seed not verified against the 20 enforced codes |
| `Branch` | `Branch` | `branches` | READY — TM-02 noted |
| `AccountingPeriod` | `AccountingPeriod` | `accounting_periods` | READY — MAPPING REQUIRED (`label` computed) |
| `ExpenseCategory` | `ExpenseCategory` | `expense_categories` + `category_aliases` | READY |
| `MasterItem` (department) | `MasterItem` | `departments` | READY |
| `MasterItem` (payment method) | `MasterItem` | `payment_methods` | READY |
| `Expense` | `Expense` | `expenses` | READY — MAPPING REQUIRED (display names via JOIN; `periodId` ↔ `accounting_period_id`); TM-03 |
| `ExpenseCreateInput` | request DTO | `expenses` | READY |
| `DailyRevenue` | `DailyRevenue` | **none** | **MISSING** (DG-01) |
| `DailyRevenueInput` | request DTO | **none** | **MISSING** |
| `RevenuePlanLine` / `RevenuePlanBoard` | same | `revenue_plans` | **PARTIAL** — flat contract vs revisioned table; `dailyPlanUzs`/`daysInMonth` computed |
| `BudgetLine` | `BudgetLine` | `budget_lines` | **PARTIAL** — TM-04 / DG-04 |
| `BudgetPlan` | `BudgetPlan` | `budget_versions` + `budget_lines` | **PARTIAL** — flat vs revisioned |
| `DashboardResponse` | `DashboardResponse` | composite of `v_expense_plan_vs_actual`, revenue source, + service composition | **PARTIAL** — CG-01, DG-01 |
| `AnnualExpenseSummary` | nested in dashboard | no view — service composition | MAPPING REQUIRED |
| `TrendPoint` | nested in dashboard | no view — service composition | MAPPING REQUIRED |
| `MonthlyReport` / `MonthlyReportRow` | same | `v_monthly_expense_report`, `v_expense_plan_vs_actual` | READY |
| `BranchComparisonReport` / `BranchSummary` | same | `v_branch_comparison`, `v_two_branch_month_matrix` | READY |
| `PlanActual` | nested in reports | `v_expense_plan_vs_actual` | READY |
| `CashierReport` / `CashierRow` | same | `v_cashier_report` (+ salary) | **PARTIAL** — DG-02 |
| `ImportSummary` | response DTO | `import_batches` + `import_rows` + `expenses` | **PARTIAL** — CG-04 |
| `TelegramSettings` / `TelegramRecipient` | same | `system_settings` (+ recipient store) | **PARTIAL** — DG-03 |
| `ReminderPreview` / `MonthlyReportPreview` | same | derived from revenue + dashboard | **PARTIAL** — CG-02, DG-01 |
| `PaginatedResponse<T>` | envelope | — | READY (LIMIT/OFFSET) |
| `ApiErrorBody` | error envelope | — | READY |

---

## 9. Authentication & RBAC Mapping

Based only on code that exists.

| Question | Answer | Evidence |
|---|---|---|
| Login endpoint | `POST /auth/login`, body `{login, password}` → `AuthenticatedUser` | `FILE: src/shared/api/contracts.ts`, `authApi.login` |
| Logout endpoint | `POST /auth/logout` → 204 | same |
| Current user endpoint | `GET /me` → `AuthenticatedUser` | `authApi.me`; called on app boot by `auth-context.tsx` |
| Token handling | **NOT IMPLEMENTED.** No token is read, stored or attached by the frontend. `api.ts` sets `credentials: 'include'` on every request | `FILE: src/shared/api/client.ts`, `apiRequest` |
| Token storage | **MOCK ONLY** — the MSW layer keeps the signed-in user id in `sessionStorage` under `fincore.mock.user`. The application code never touches it | `FILE: src/mocks/handlers.ts`, `storedMockUser` |
| Refresh token | **NOT IMPLEMENTED** — no endpoint, no type, no interceptor, no retry-on-401 | verified across `contracts.ts` and `client.ts` |
| Where role info comes from | The `AuthenticatedUser` payload returned by `/auth/login` and `/me`: `roles[]`, `permissions[]`, `branchScopes[]`, `writeBranchScopes[]` | `FILE: src/shared/types/domain.ts`, `AuthenticatedUser` |
| How permission checks work | `useAuth().hasPermission(code)` reads the `permissions[]` array from that payload. Server re-checks independently on every route | `FILE: src/features/auth/auth-context.tsx` |
| Protected routes | `<ProtectedRoute>` (session) wraps `<PermissionRoute permission={code \| code[]}>` (OR-semantics for arrays) | `FILE: src/features/auth/auth-guards.tsx` |
| Branch access | Two arrays: `branchScopes` (read) and `writeBranchScopes` (write). The top-bar branch selector lists only `branchScopes`; `branch=all` appears only with `expense.view_all_branches` | `FILE: src/app/layout/app-shell.tsx`, `TopBar` |

**Implication for the backend:** the frontend expects a **cookie-based session** — it sends credentials and never sets an `Authorization` header. A bearer-token design would require a frontend change. The choice itself is not made here (Phase 17.1 DEC-04); this records only what the frontend expects today.

**Session invalidation is already contractual:** `requireUser` re-checks the account's status on **every** request and returns 401 `ACCOUNT_DISABLED` if it changed, and the frontend handles that path (e2e: an admin blocks a user, whose next login is refused).

---

## 10. Reports & Break-even Mapping

| Report | Frontend | API | MSW | Database view | Response DTO |
|---|---|---|---|---|---|
| **Dashboard** | ✔ `/dashboard` | ✔ `GET /reports/dashboard` | ✔ | ⚠️ composite; no view for `granularity` or the annual block | ✔ `DashboardResponse` |
| **Monthly report** | ✔ `/reports/monthly` | ✔ `GET /reports/monthly` | ✔ | ✔ `v_monthly_expense_report` | ✔ `MonthlyReport` |
| **Branch comparison** | ✔ `/reports/branches` | ✔ `GET /reports/branch-comparison` | ⚠️ hardcoded figures (MOCK-ONLY) | ✔ `v_branch_comparison`, `v_two_branch_month_matrix` | ✔ `BranchComparisonReport` |
| **Cashier report** | ✔ `/reports/cashiers` | ✔ `GET /reports/cashiers` | ✔ | ⚠️ `v_cashier_report` + missing salary column | ✔ `CashierReport` |
| **Profit / Loss** | ✖ no route | ✖ no endpoint | ✖ | ✔ `v_profit_loss`, `v_profit_loss_center` | ✖ |
| **Break-even** | ✖ no route | ✖ no endpoint | ✖ | ✔ `v_break_even`, `v_break_even_center` | ✖ |

**Break-even status: FRONTEND NOT IMPLEMENTED · DATABASE READY · API MISSING.**

Verified in this phase: no route in `app-router.tsx`, no entry in `routes.ts`, no type in `domain.ts`, no function in `contracts.ts`, no handler in `handlers.ts`. Per instruction it is **not** added to the Phase 18 backend scope. The database views remain available for a future contract addition; no new table would be required.

**Profit/Loss** is in the identical position and is likewise not scoped in.

---

## 11. Required NestJS Modules

Nine feature modules and three infrastructure modules — derived strictly from §5.

| Module | Endpoints | Primary tables / views | Status |
|---|---|---|---|
| **AuthModule** | 1, 2, 3 | `users`, `user_roles`, `roles`, `role_permissions`, `permissions` | PARTIAL — session transport undecided |
| **RbacModule** | 39, 40 | `roles`, `permissions`, `role_permissions` | PARTIAL — permission seed unverified |
| **BranchesModule** | 4 | `branches` | READY |
| **AccountingPeriodsModule** | 5 | `accounting_periods` | READY (read-only; no close endpoint exists) |
| **MasterDataModule** | 6, 7, 8, 10, 11 | `expense_categories`, `category_aliases`, `departments`, `payment_methods` | READY |
| **UsersModule** | 9, 34, 35, 36, 37, 38 | `users`, `user_roles` | PARTIAL — DG-02 |
| **ExpensesModule** | 12, 13, 14, 15 | `expenses` | **READY** |
| **BudgetsModule** | 22, 23 | `budget_versions`, `budget_lines` | PARTIAL — TM-04, revisioning |
| **RevenueModule** | 16–21 | **none** for daily revenue; `revenue_plans` for planning | **BLOCKED** — DG-01 |
| **ReportsModule** | 24, 25, 26, 27 | `v_monthly_expense_report`, `v_branch_comparison`, `v_two_branch_month_matrix`, `v_cashier_report` | PARTIAL — CG-01, DG-01, DG-02 |
| **ImportsModule** | 28 | `import_batches`, `import_rows`, `expenses` | PARTIAL — CG-04 |
| **NotificationsModule** | 29–33 | `system_settings` | PARTIAL — DG-03, CG-02 |
| *AuditModule* (infrastructure) | — | `audit_logs` | PARTIAL — no frontend consumer, but the DB expects writes |
| *PrismaModule* (infrastructure) | — | — | READY |
| *CommonModule* (infrastructure) | — | — | READY |

`CommonModule` must provide the error envelope the frontend already parses: `{code, message, details?}` with `content-type: application/json` on **every** error including 401/403/404/500 — a non-JSON error body is surfaced to the user as `API_UNAVAILABLE` (`FILE: src/shared/api/client.ts`).

---

## 12. Backend Implementation Order

Ordered by actual frontend dependency, not by convention.

### PHASE 18.1 — Backend Foundation
- **Dependencies:** none
- **Modules:** `CommonModule`, `PrismaModule`, config
- **Endpoints:** none
- **Tables:** none (Prisma introspection only)
- **Risk:** LOW · **Status: READY**
- Must deliver the `{code, message, details}` error envelope and the `MoneyUzs`-as-string serialiser (TM-01) before anything else.

### PHASE 18.2 — Authentication + Authorization
- **Dependencies:** 18.1
- **Modules:** `AuthModule`, `RbacModule`, guards (`JwtGuard`/session, `PermissionGuard`, `BranchScopeGuard`, `PeriodOpenGuard`, `DirectorOnlyGuard`)
- **Endpoints:** 1, 2, 3, 39, 40
- **Tables:** `users`, `user_roles`, `roles`, `permissions`, `role_permissions`
- **Risk:** MEDIUM — session transport (OD-01) and permission-seed drift (OD-02)
- **Status: PARTIAL**

### PHASE 18.3 — Reference / Master Data
- **Dependencies:** 18.2
- **Modules:** `BranchesModule`, `AccountingPeriodsModule`, `MasterDataModule`
- **Endpoints:** 4, 5, 6, 7, 8, 10, 11
- **Tables:** `branches`, `accounting_periods`, `expense_categories`, `category_aliases`, `departments`, `payment_methods`
- **Risk:** LOW · **Status: READY**

### PHASE 18.4 — Users & Administration
- **Dependencies:** 18.2, 18.3
- **Modules:** `UsersModule`, `AuditModule`
- **Endpoints:** 9, 34, 35, 36, 37, 38
- **Tables:** `users`, `user_roles`, `audit_logs`
- **Risk:** MEDIUM — DG-02 (salary column) blocks endpoint 38 only
- **Status: PARTIAL**
- Carries AUZ-07…AUZ-11, the highest-consequence authorization rules in the system.

### PHASE 18.5 — Expenses
- **Dependencies:** 18.3, 18.4
- **Modules:** `ExpensesModule`
- **Endpoints:** 12, 13, 14, 15
- **Tables:** `expenses`
- **Risk:** LOW · **Status: READY**
- The only large domain with no open decision. Establishes the patterns (idempotency, period derivation, branch scope, snapshotting) every later module reuses.

### PHASE 18.6 — Budgets
- **Dependencies:** 18.5
- **Modules:** `BudgetsModule`
- **Endpoints:** 22, 23
- **Tables:** `budget_versions`, `budget_lines`
- **Risk:** MEDIUM — TM-04 must be implemented as row absence; revisioning decision (OD-03)
- **Status: PARTIAL**

### PHASE 18.7 — Revenue
- **Dependencies:** 18.5, 18.6
- **Modules:** `RevenueModule`
- **Endpoints:** 16, 17, 18, 19, 20, 21
- **Tables:** `revenue_plans` + **a daily-revenue store that does not yet exist**
- **Risk:** **HIGH — BLOCKED by DG-01**
- **Status: BLOCKED**

### PHASE 18.8 — Reports
- **Dependencies:** 18.5, 18.6, 18.7
- **Modules:** `ReportsModule`
- **Endpoints:** 24, 25, 26, 27
- **Views:** `v_monthly_expense_report`, `v_branch_comparison`, `v_two_branch_month_matrix`, `v_cashier_report`
- **Risk:** MEDIUM — 25 and 26 are READY today; 27 needs DG-02; 24 needs 18.7 plus CG-01 composition
- **Status: PARTIAL** — can be split: monthly + branch comparison immediately after 18.6.

### PHASE 18.9 — Imports & Notifications
- **Dependencies:** 18.5, 18.7, 18.8
- **Modules:** `ImportsModule`, `NotificationsModule`
- **Endpoints:** 28, 29, 30, 31, 32, 33
- **Tables:** `import_batches`, `import_rows`, `system_settings`
- **Risk:** MEDIUM — CG-02/03/04, DG-03
- **Status: PARTIAL**

### PHASE 18.10 — Frontend Integration
- **Dependencies:** all of the above
- **Work:** contract-parity suite across all 40 endpoints, then flip `VITE_ENABLE_MOCKS=false`
- **Risk:** LOW if the parity suite passes · **Status:** gated

---

## 13. Blockers

| ID | Blocker | Blocks | Blocks backend start? |
|---|---|---|---|
| **BLK-18-01** | **No database table for daily revenue** (DG-01). The frontend's `DailyRevenue` (branch × day, cash/card/transfer split, unique per day) exists in no candidate schema | Endpoints 16–19; dashboard revenue half (24); reminder preview (31); PHASE 18.7 | **No** — 18.1 through 18.6 are unaffected. Blocks 18.7 onward |

**One blocker.** DG-02 (salary column), DG-03 (chat id) and DG-04 (budget nullability) are gaps with clear, cheap resolutions and are not classified as blockers.

---

## 14. Open Decisions

| ID | Decision | Blocks | Carried from |
|---|---|---|---|
| **OD-01** | Session transport: cookie (what the frontend expects today) vs bearer token (would require a frontend change). Refresh-token contract does not exist | PHASE 18.2 | 17.1 DEC-04 |
| **OD-02** | Reconcile the permission seed against the 20 codes actually enforced | PHASE 18.2 | 17.1 DEC-09 |
| **OD-03** | Budget & revenue plan: does `PUT` create a new revision or update the applicable one in place? | 18.6, 18.7 | 17.1 DEC-02 |
| **OD-04** | Daily-revenue grain and where it is stored | **18.7 (BLK-18-01)** | 17.1 DEC-02 |
| **OD-05** | Audit scope — which of the 24 business rules produce `audit_logs` rows, whether denied attempts are logged, retention | 18.4 onward | 17.1 DEC-07 |
| **OD-06** | Salary storage: column on `users` vs salary-history table; who may read it | 18.4 (endpoint 38), 18.8 (report 27) | 17.1 DEC-08 |
| **OD-07** | Import: accept browser-parsed rows (current contract) or the raw file server-side | 18.9 | 17.1 DEC-05 |
| **OD-08** | Telegram recipient storage: `system_settings` JSONB vs a dedicated table | 18.9 | 17.1 DEC-06 |
| **OD-09** | Notification message templates: keep them as frontend source, or move to the backend so preview and delivery cannot diverge (CG-02) | 18.9 | new in 18.0 |

### Conflicts

| Conflict ID | Source A | Source B | Impact | Blocks backend? | Recommended decision |
|---|---|---|---|---|---|
| **CF-18-01** | Frontend: `DailyRevenue` = branch × day | `001_reference_schema.sql`: `revenue_transactions` = per payment | 4 endpoints + 2 reports have no persistence target | **Yes** (18.7+) | Product owner picks the grain; if per-payment wins, the frontend contract changes |
| **CF-18-02** | Frontend `Expense` DTO has no `status` | `expenses.status NOT NULL` | Insert fails without a server-side default | No | Default to the "approved"/workflow-off value per DECISION-B |
| **CF-18-03** | Frontend `AuthenticatedUser.fixedSalaryUzs` | `users` has no such column | Endpoint 38 and report 27 cannot persist/read | No | Add the column (OD-06) |
| **CF-18-04** | Contract: flat `PUT` replaces the plan | DB: append-only revisions with approval status | Semantics of a save differ | No | OD-03 |
| **CF-18-05** | Frontend sends no auth header, uses `credentials:'include'` | No session/JWT design is recorded anywhere | Auth cannot be built without choosing | No (decidable) | OD-01 |

Per instruction, none of these are resolved here.

---

## 15. PHASE 18 Readiness

| Sub-phase | Status |
|---|---|
| 18.1 Foundation | **READY** |
| 18.2 Auth + RBAC | **PARTIAL** — OD-01, OD-02 |
| 18.3 Reference / Master data | **READY** |
| 18.4 Users & Administration | **PARTIAL** — OD-05, OD-06 (endpoint 38 only) |
| 18.5 Expenses | **READY** |
| 18.6 Budgets | **PARTIAL** — OD-03 |
| 18.7 Revenue | **BLOCKED** — BLK-18-01 / OD-04 |
| 18.8 Reports | **PARTIAL** — 25 & 26 ready; 27 needs OD-06; 24 needs 18.7 |
| 18.9 Imports & Notifications | **PARTIAL** — OD-07, OD-08, OD-09 |
| 18.10 Frontend integration | Gated |

---

## 16. Final Verdict

From an integration standpoint the target is clear in a way it was not in Phase 17.1. The frontend calls exactly 40 endpoints, all of them declared, all of them mocked, none of them dead, and the MSW layer encodes 24 business rules, 13 authorization rules and 11 validation rules that are consistent with the database's own constraints. That is a good specification to build against.

Three sub-phases — Foundation, Reference/Master Data and Expenses — are unblocked, unambiguous and can start immediately. Auth and Users are decidable rather than blocked: each waits on a choice, not on missing architecture.

One genuine blocker remains, and it is the same one Phase 17.1 identified: the daily-revenue grain has no home. It stops Phase 18.7 and everything that reads revenue, but it does not stop the first six sub-phases.

Break-even and Profit/Loss have database views and no frontend. Per instruction they are recorded, not scoped in.

---

```
PHASE 18.0 COMPLETE

FILES INSPECTED: 10 (targeted; no recursive repository read)
ACTIVE ENDPOINTS: 40
UNUSED ENDPOINTS: 0
UI WITHOUT API: 1
REQUIRED BACKEND MODULES: 12 (9 feature + 3 infrastructure)
DATABASE-READY MODULES: 7
PARTIAL MODULES: 4
BLOCKERS: 1
CONFLICTS: 5
OPEN DECISIONS: 9

READY FOR PHASE 18.1:
YES

NEXT RECOMMENDED PHASE:
PHASE 18.1 — BACKEND FOUNDATION (NestJS skeleton, config,
error envelope, MoneyUzs serialisation, Prisma wiring)
```

---

*Prepared under Phase 18.0 constraints. No backend code, NestJS project, migration, SQL change, frontend change, contract change or document modification was made. Only this file was created.*
