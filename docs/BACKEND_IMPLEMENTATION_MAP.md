# FINCORE BACKEND IMPLEMENTATION MAP

**Phase:** 17 — Backend Contract & Architecture Audit
**Status:** Audit only. No backend code, no NestJS project, no installs, no migrations, no frontend/contract/schema edits were made.
**Date:** 2026-08-23

---

## 1. Audit Scope

This document maps the **existing frontend API contract** and its **MSW reference implementation** onto the **existing database architecture**, and derives a NestJS backend implementation plan.

In scope:

- Endpoint inventory and per-endpoint backend mapping
- Auth / RBAC / branch-isolation / accounting-period rules
- Transaction boundaries and audit-log requirements
- Reporting and break-even integration
- Database gaps, API gaps, conflicts, security findings
- Proposed module and folder architecture, build order, readiness verdict

Explicitly out of scope: writing any backend code, choosing between conflicting sources, or altering any existing artifact.

---

## 2. Sources Read

| Source | How it was read | Purpose |
|---|---|---|
| `src/shared/api/contracts.ts` | Full (147 lines, already in working context) | Endpoint inventory |
| `src/mocks/handlers.ts` | Structural extraction of all 40 routes + guards + error codes | Reference behaviour |
| `docs/DATABASE_ARCHITECTURE.md` | Header + targeted sections | Declared DB source of truth |
| `docs/PHASE_16_DATABASE_ARCHITECTURE.md` | Header + table inventory + decision record | Approved decisions A–E |
| `docs/PHASE_15_2_BUSINESS_DECISIONS.txt` | Decision-card index | Decision provenance |
| `docs/PHASE_15_1_DECISION_REGISTER.md` | Status lines | Open vs resolved items |
| `docs/database/001_reference_schema.sql` | Table / enum / column extraction (28 tables) | Physical schema |
| `docs/database/003_report_and_reconciliation_queries.sql` | View inventory (22 views) | Reporting layer |
| `docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md` | Targeted grep (revenue plan, roles) | TZ cross-check |
| `docs/PROJECT_REQUIREMENTS.md` | Header / status line | Excel-derived requirements |

Not read in full by design (token discipline): `FRONTEND_*.md`, `FIGMA_TZ_CONFORMANCE_ANALYSIS.md`, `DATABASE_MIGRATION_AND_OPERATIONS.md`, `002_seed_reference.sql`, `004_verification.sql`, `CLAUDE_CODE_DATABASE_ARCHITECTURE_PROMPT.md`. None of these change the endpoint→table mapping; they are referenced where relevant.

---

## 3. Source of Truth Priority

Applied exactly as instructed:

1. Most recent explicit **APPROVED DECISION**
2. `docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md`
3. `docs/DATABASE_ARCHITECTURE.md`
4. `docs/database/001_reference_schema.sql` *(named `001_schema.sql` in the brief; actual filename is `001_reference_schema.sql`)*
5. `docs/database/002_seed_reference.sql` *(brief: `002_seed.sql`)*
6. `docs/database/003_report_and_reconciliation_queries.sql`
7. `src/shared/api/contracts.ts`
8. `src/mocks/handlers.ts`
9. Older / superseded documentation

**Priority-1 complication (see CONFLICT-01):** the approved decision set (DECISION-A…E) is recorded inside `PHASE_16_DATABASE_ARCHITECTURE.md`, which describes a **17-table** schema. The executable SQL in `docs/database/` implements a **different, 28-table** schema and never references those decisions. Both sit above the frontend contract in priority and they disagree with each other. This is not resolved here.

---

## 4. Current Frontend → Mock → Backend Transition

```
React Frontend
      ↓            src/shared/api/contracts.ts  (40 endpoints — must not change)
API Contract
      ↓            VITE_ENABLE_MOCKS=true
Current MSW Mock   src/mocks/handlers.ts (40 routes, in-memory, resets on reload)
      ↓            VITE_ENABLE_MOCKS=false
Target NestJS API  REST + JWT + RBAC guards + Prisma
      ↓
PostgreSQL         schema `fincore` — 28 tables, 22 views, 15 enums
```

Contract/mock parity is **exact**: 40 contract calls ↔ 40 mock routes. No orphan mock route, no contract call without a handler. The frontend is therefore a stable target — the backend must satisfy these 40 and nothing else.

---

## 5. Complete Endpoint Inventory

40 endpoints, grouped by domain.

| # | Method | Path | Domain |
|---|---|---|---|
| 1 | POST | `/auth/login` | Auth |
| 2 | POST | `/auth/logout` | Auth |
| 3 | GET | `/me` | Auth |
| 4 | GET | `/branches` | Reference |
| 5 | GET | `/periods` | Reference |
| 6 | GET | `/master/categories` | Reference |
| 7 | GET | `/master/departments` | Reference |
| 8 | GET | `/master/payment-methods` | Reference |
| 9 | GET | `/users/directory` | Reference |
| 10 | POST | `/master/:kind` | Master data |
| 11 | PATCH | `/master/:kind/:id` | Master data |
| 12 | GET | `/expenses` | Expenses |
| 13 | GET | `/expenses/:id` | Expenses |
| 14 | POST | `/expenses` | Expenses |
| 15 | PATCH | `/expenses/:id` | Expenses |
| 16 | GET | `/daily-revenues` | Revenue |
| 17 | GET | `/daily-revenues/:id` | Revenue |
| 18 | POST | `/daily-revenues` | Revenue |
| 19 | PATCH | `/daily-revenues/:id` | Revenue |
| 20 | GET | `/revenue-plans/:periodId` | Revenue planning |
| 21 | PUT | `/revenue-plans/:periodId` | Revenue planning |
| 22 | GET | `/budget-plans/:periodId` | Budget |
| 23 | PUT | `/budget-plans/:periodId/lines` | Budget |
| 24 | GET | `/reports/dashboard` | Reports |
| 25 | GET | `/reports/monthly` | Reports |
| 26 | GET | `/reports/branch-comparison` | Reports |
| 27 | GET | `/reports/cashiers` | Reports |
| 28 | POST | `/imports/expenses` | Import |
| 29 | GET | `/notifications/telegram` | Notifications |
| 30 | PUT | `/notifications/telegram` | Notifications |
| 31 | GET | `/notifications/reminder-preview` | Notifications |
| 32 | GET | `/notifications/monthly-preview` | Notifications |
| 33 | POST | `/notifications/telegram/test` | Notifications |
| 34 | GET | `/admin/users` | Administration |
| 35 | POST | `/users` | Administration |
| 36 | PUT | `/users/:id/access` | Administration |
| 37 | PATCH | `/users/:id/status` | Administration |
| 38 | PATCH | `/users/:id/salary` | Administration |
| 39 | GET | `/roles/permissions` | RBAC |
| 40 | PUT | `/roles/:role/permissions` | RBAC |

---

## 6. Endpoint → Backend Mapping

Legend — **DB**: ✅ clean target · ⚠️ shape mismatch · ❌ no target (gap).
**Tx**: REQUIRED / RECOMMENDED / NOT NEEDED. **Audit**: does it need an `audit_logs` row.

### 6.1 Auth

| # | Endpoint | Permission | Branch | Period | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|---|---|
| 1 | POST `/auth/login` | none | — | — | `users`, `user_roles`, `roles`, `role_permissions`, `permissions` | ✅ | Auth | NOT NEEDED | Yes (success + failure) |
| 2 | POST `/auth/logout` | none | — | — | token/session invalidation | ✅ | Auth | NOT NEEDED | Yes |
| 3 | GET `/me` | none (authenticated) | — | — | same projection as login | ✅ | Auth | No |

**Reference behaviour (mock):** login by phone+password, rejects non-`active` users, returns the full `AuthenticatedUser` projection including `permissions[]`, `branchScopes[]`, `writeBranchScopes[]`, `fixedSalaryUzs`. `/me` re-checks status on every call and 401s with `ACCOUNT_DISABLED` if the account was disabled mid-session — **CONFIRMED, keep this behaviour**.

- `MOCK-ONLY`: `sessionStorage` persistence and the plaintext `demo123` comparison. Backend uses JWT + Argon2id/bcrypt.
- `NEEDS DECISION` (**DEC-04**): token transport (HTTP-only cookie vs `Authorization` header), TTL, refresh-token contract. The contract has **no refresh endpoint**; the login page copy says "Production sessiya HTTP-only cookie orqali boshqariladi", which implies cookies. `api.ts` already sends `credentials: 'include'` — consistent with cookies, but never formally decided.

### 6.2 Reference data

| # | Endpoint | Permission | Branch | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|---|
| 4 | GET `/branches` | authenticated | filtered by `branchScopes` | `branches` | ✅ | Branches | NOT NEEDED | No |
| 5 | GET `/periods` | authenticated | — | `accounting_periods` | ✅ | AccountingPeriods | NOT NEEDED | No |
| 6 | GET `/master/categories` | authenticated | — | `expense_categories` + `category_aliases` | ✅ | MasterData | NOT NEEDED | No |
| 7 | GET `/master/departments` | authenticated | — | `departments` | ✅ | MasterData | NOT NEEDED | No |
| 8 | GET `/master/payment-methods` | authenticated | — | `payment_methods` | ✅ | MasterData | NOT NEEDED | No |
| 9 | GET `/users/directory` | authenticated | center-read gate | `users`, `user_roles` | ✅ | Users | NOT NEEDED | No |

`/users/directory` returns a **safe projection** (`id, fullName, status, roles`) and deliberately omits phone, permissions, scopes, salary. **CONFIRMED — this is a real security boundary**, covered by e2e `safe-directory.spec.ts`. Backend must reproduce it as an explicit DTO, never `select *`.

### 6.3 Master data mutations

| # | Endpoint | Permission | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|
| 10 | POST `/master/:kind` | `master_data.manage` | `expense_categories` / `departments` / `payment_methods` | ✅ | MasterData | RECOMMENDED | Yes |
| 11 | PATCH `/master/:kind/:id` | `master_data.manage` | same | ✅ | MasterData | RECOMMENDED | Yes |

`:kind` ∈ `categories | departments | payment-methods`. Duplicate `code` (case-insensitive) → 409 `DUPLICATE_REFERENCE` — **CONFIRMED**, and the DB already enforces it with unique indexes. `isActive=false` is a soft delete; there is no hard delete anywhere in the contract — **CONFIRMED**.

### 6.4 Expenses

| # | Endpoint | Permission | Branch | Period | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|---|---|
| 12 | GET `/expenses` | `expense.view_own_branch` \| `expense.view_all_branches` | scope filter | — | `expenses` (+ `v_expense_net_rows`) | ✅ | Expenses | NOT NEEDED | No |
| 13 | GET `/expenses/:id` | same | `canUseBranch` | — | `expenses` | ✅ | Expenses | NOT NEEDED | No |
| 14 | POST `/expenses` | `expense.create` | `canWriteBranch` | period must exist + be **open** | `expenses` | ✅ | Expenses | REQUIRED | Yes |
| 15 | PATCH `/expenses/:id` | `expense.edit` | `canWriteBranch` | old **and** new period must be open | `expenses` | ✅ | Expenses | REQUIRED | Yes |

Reference rules — all **CONFIRMED**, all mirrored by DB constraints:

- `amount_uzs` must be a positive integer string → DB domain `uzs_amount_positive`.
- Accounting period is **derived server-side from `transactionDate`**, never accepted from the client. Invalid/missing → 422 `DATE_OR_PERIOD_INVALID`.
- Writing to a closed period → 409 `PERIOD_LOCKED`.
- `Idempotency-Key` header must equal `body.idempotencyKey`, else 422 `IDEMPOTENCY_KEY_REQUIRED`; replay returns the original row with 200 (not 201). DB has `expenses.idempotency_key` — **CONFIRMED**, needs a unique index per actor.
- Category/payment-method/department must be **active**; `expense_type`, `category_code`, `category_name` are **snapshotted** onto the row. DB has all three snapshot columns — **CONFIRMED**.
- Immutable on edit: `id`, `branch_id`, `entered_by`. **CONFIRMED**.

`MOCK-ONLY`: `id` generated as `exp-mock-N`. `DATABASE AUTHORITATIVE`: `expense_type_snapshot` and period resolution belong in the service + DB, not the client.

**Not exercised by the contract but present in DB:** `status`, `reviewed_by`, `reviewed_at`, `rejection_reason`, `is_reversed`, `reversed_*`, `expense_reversals`. See CONFLICT-02.

### 6.5 Revenue (daily)

| # | Endpoint | Permission | Branch | Period | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|---|---|
| 16 | GET `/daily-revenues` | `revenue.view_own_branch` \| `revenue.view_all_branches` | scope filter | — | *none* | ❌ | Revenue | NOT NEEDED | No |
| 17 | GET `/daily-revenues/:id` | same | `canUseBranch` | — | *none* | ❌ | Revenue | NOT NEEDED | No |
| 18 | POST `/daily-revenues` | `revenue.create` | `canWriteBranch` | must be open | *none* | ❌ | Revenue | REQUIRED | Yes |
| 19 | PATCH `/daily-revenues/:id` | `revenue.edit` \| `revenue.create` | `canWriteBranch` | must be open | *none* | ❌ | Revenue | REQUIRED | Yes |

**This is the single largest structural gap — see CONFLICT-01 / GAP-DB-01.**

Contract model: **one row per (branch, business date)** carrying `cashUzs`, `cardUzs`, `transferUzs`, derived `totalUzs`, `comment`, `enteredBy`. Uniqueness on `(branchId, businessDate)` is a business rule: a second POST for the same day returns 409 `REVENUE_DAY_EXISTS` with the existing id — **CONFIRMED, and it must become a DB unique constraint**.

Neither candidate schema has this shape:
- `001_reference_schema.sql` → `revenue_transactions`, one row **per payment** (receipt_no, collector, channel, on-behalf).
- `PHASE_16` → `revenue_records`, one row **per period** (no day dimension).

The contract sits between them. Backend cannot start on this module until resolved.

### 6.6 Revenue planning

| # | Endpoint | Permission | Period | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|---|
| 20 | GET `/revenue-plans/:periodId` | `revenue_plan.manage` \| `reports.view` | — | `revenue_plans` | ⚠️ | RevenuePlans | NOT NEEDED | No |
| 21 | PUT `/revenue-plans/:periodId` | `revenue_plan.manage` | closed → 409 | `revenue_plans` | ⚠️ | RevenuePlans | REQUIRED | Yes |

Contract shape: **flat** — per branch, a single `plannedAmountUzs`, plus a server-derived `dailyPlanUzs` (monthly ÷ days-in-month) and `daysInMonth`. PUT replaces the whole board.

DB shape: revisioned (`revision_no`, `status` draft→submitted→approved→locked, `is_applicable`, submitted/approved/locked actor+timestamp).

⚠️ **Shape mismatch, not a blocker**: the flat contract can be served by always reading/writing the single `is_applicable` revision. But "PUT replaces the applicable plan in place" contradicts the DB's append-only revision intent. **NEEDS DECISION (DEC-02)**.

`dailyPlanUzs` is computed, never stored — **CONFIRMED as service-layer logic**.

### 6.7 Budget

| # | Endpoint | Permission | Period | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|---|
| 22 | GET `/budget-plans/:periodId` | `budget.view` | — | `budget_versions` + `budget_lines` | ⚠️ | Budgets | NOT NEEDED | No |
| 23 | PUT `/budget-plans/:periodId/lines` | `budget.create_edit` | closed → 409 | `budget_lines` | ⚠️ | Budgets | REQUIRED | Yes |

Same class of mismatch as 6.6: contract is a **flat, directly-editable** matrix (category × branch) for a period; DB is revisioned with an approval chain.

Reference semantics — **CONFIRMED and load-bearing, must survive**:
- `hasPlan=false` ("no plan line") and `plannedAmountUzs='0'` ("zero plan") are **different states**. A no-plan line yields `null` variance and `—` completion; a zero plan with positive actual is "Rejadan tashqari / Unplanned". Covered by e2e `acceptance-budget.spec.ts`.
- ⚠️ DB `budget_lines.planned_amount_uzs` is `NOT NULL`, so "no plan line" must be modelled as **row absence**, not a null amount. Backend must not invent a nullable column. **CONFIRMED constraint on the implementation.**
- `actualAmountUzs` is always computed from `expenses`, never stored.

`MOCK-ONLY`: `buildBudgetPlan()` synthesises a full category × branch grid on read. Backend should serve the same grid via `v_expense_plan_vs_actual` / `v_applicable_budget_line`.

### 6.8 Reports

| # | Endpoint | Permission | Branch | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|---|
| 24 | GET `/reports/dashboard` | `dashboard.view` | `scopedBranchFilter` | composite (see §14) | ⚠️ | Reports | NOT NEEDED | No |
| 25 | GET `/reports/monthly` | `reports.view` | `canUseBranch` | `v_monthly_expense_report` | ✅ | Reports | NOT NEEDED | No |
| 26 | GET `/reports/branch-comparison` | `reports.view` | scope filter | `v_branch_comparison`, `v_two_branch_month_matrix` | ✅ | Reports | NOT NEEDED | No |
| 27 | GET `/reports/cashiers` | `reports.view_cashiers` \| `reports.view_own_performance` | `canUseBranch` | `v_cashier_report` | ⚠️ | Reports | NOT NEEDED | No |

- **24** needs a `granularity` parameter (`daily|weekly|monthly`) that no view provides, plus the annual "Xulosa" block (fixed share, average monthly, peak month, 12-month dynamics). Composition work, not a gap — except that its revenue half depends on GAP-DB-01.
- **26** currently returns **hardcoded** monthly figures in the mock (`MOCK-ONLY` — the mock does not read `expenseRows` for this endpoint). Backend must compute for real; expect the numbers to change. Flagged so it is not mistaken for a regression.
- **27** joins per-cashier revenue with **`fixedSalaryUzs`**, which has no column (GAP-DB-02), and applies `scope: 'own' | 'all'` row filtering (see §11).

### 6.9 Import

| # | Endpoint | Permission | Branch | Period | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|---|---|
| 28 | POST `/imports/expenses` | `import.run` | `canWriteBranch` per row | per-row, closed → reject row | `import_batches`, `import_rows`, `expenses` | ⚠️ | Imports | REQUIRED | Yes |

Contract posts a **plain array of already-parsed rows**; the .xlsx is parsed **in the browser** (`exceljs`). DB models a full server-side batch pipeline (file hash, sheet names, preview → approve → commit, per-row status, typed exceptions).

Reference behaviour — **CONFIRMED**:
- Idempotency by `(sourceSheet, sourceRow)`: an already-imported pair is **skipped**, not duplicated. `expenses.source_sheet` + `source_row` exist; needs a unique index.
- Per-row rejection with a reason; the batch still commits the valid rows. Response: `{imported, skipped, totalUzs, rejected[]}`.

**NEEDS DECISION (DEC-05)**: keep client-side parsing (contract as-is, `import_batches` largely unused) or move parsing server-side (richer, but a contract change).

**SECURITY (SEC-02)**: the client sends fully-resolved `categoryId`, `branchId`, `amountUzs`, `responsibleUserId`. Every one must be re-validated server-side — the mock already re-checks permission, branch write-scope, period state and references. Backend must not weaken this.

### 6.10 Notifications

| # | Endpoint | Permission | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|
| 29 | GET `/notifications/telegram` | `notification.manage` | `system_settings` | ⚠️ | Notifications | NOT NEEDED | No |
| 30 | PUT `/notifications/telegram` | `notification.manage` | `system_settings` | ⚠️ | Notifications | RECOMMENDED | Yes |
| 31 | GET `/notifications/reminder-preview` | `notification.manage` | daily revenue + `users` | ❌ | Notifications | NOT NEEDED | No |
| 32 | GET `/notifications/monthly-preview` | `notification.manage` | dashboard composite | ⚠️ | Notifications | NOT NEEDED | No |
| 33 | POST `/notifications/telegram/test` | `notification.manage` | — (external call) | ✅ | Notifications | NOT NEEDED | Yes |

- **Bot token is write-only**: GET returns `botTokenSet: boolean`, never the token. **CONFIRMED — a real security boundary, verified in-browser.** Backend must store it encrypted at rest.
- `system_settings(key TEXT, value JSONB)` can hold the settings blob. **Per-user `chatId` has no column** — either nested in the JSONB blob or a new table. **NEEDS DECISION (DEC-06)**.
- **31/32 are previews only.** Actual scheduled delivery does not exist and is not in the contract — a scheduler (cron/queue) is future work, explicitly out of the 40 endpoints.
- **33** returns `{delivered: false, note: 'DEMO_NO_BACKEND'}` in the mock — `MOCK-ONLY`; the backend replaces it with a real Bot API call.

### 6.11 Administration & RBAC

| # | Endpoint | Permission | DB target | DB | Module | Tx | Audit |
|---|---|---|---|---|---|---|---|
| 34 | GET `/admin/users` | `user.manage` | `users`, `user_roles` | ⚠️ | Users | NOT NEEDED | No |
| 35 | POST `/users` | `user.manage` | `users`, `user_roles` | ⚠️ | Users | REQUIRED | Yes |
| 36 | PUT `/users/:id/access` | `user.manage` | `user_roles` | ✅ | Users | REQUIRED | Yes |
| 37 | PATCH `/users/:id/status` | `user.manage` | `users.status` | ✅ | Users | RECOMMENDED | Yes |
| 38 | PATCH `/users/:id/salary` | `user.manage` | *none* | ❌ | Users | RECOMMENDED | Yes |
| 39 | GET `/roles/permissions` | `role.manage` | `role_permissions` | ✅ | Roles | NOT NEEDED | No |
| 40 | PUT `/roles/:role/permissions` | `role.manage` | `role_permissions` | ✅ | Roles | REQUIRED | Yes |

Privilege-escalation rules — all **CONFIRMED**:
- Only a **director** may grant or modify the `director` role (`PRIVILEGE_ESCALATION_DENIED`).
- Only a **director** may edit role→permission grants, even with `role.manage`.
- The **last active director cannot** lose the role or be deactivated (`LAST_DIRECTOR_REQUIRED`).
- `director` cannot be combined with another role (`ROLE_COMBINATION_INVALID`).
- Cashier role **requires** an active `branchId`; center roles require `branchId = null` (`ROLE_SCOPE_INVALID`). DB `user_roles.branch_id` is nullable — matches.
- Changing a role's permissions **recomputes every affected user's effective permissions**, and refreshes the caller's own session. Backend equivalent: recompute on read, or invalidate the permission cache.

⚠️ 34/35 return `AuthenticatedUser` including `fixedSalaryUzs` — blocked by GAP-DB-02.

---

## 7. Endpoint Coverage Summary

| Metric | Count |
|---|---|
| Total endpoints in contract | **40** |
| Mock routes implemented | **40** (exact parity) |
| ✅ Clean database target | **22** |
| ⚠️ Shape mismatch (implementable after a decision) | **12** |
| ❌ No database target (blocked) | **6** |
| Endpoints requiring a DB transaction | **12** |
| Endpoints requiring an audit-log row | **17** |
| Database gaps | **6** |
| API contract gaps (DB/views with no endpoint) | **9** |
| Conflicts / NEEDS DECISION | **8** |
| Security findings | **9** (2 CRITICAL, 3 HIGH, 3 MEDIUM, 1 LOW) |

Blocked (❌): endpoints 16, 17, 18, 19 (daily revenue), 31 (reminder preview — depends on daily revenue), 38 (salary).

---

## 8. NestJS Module Architecture

Derived from the contract + handlers + schema, **not** from a generic template. Nine feature modules plus three infrastructure modules.

| Module | Responsibility | Controllers (endpoints) | Prisma models | Depends on | Guards |
|---|---|---|---|---|---|
| **AuthModule** | Login, logout, `/me`, JWT issue/verify, effective-permission projection | 1, 2, 3 | `users`, `user_roles`, `roles`, `role_permissions`, `permissions` | — | — (issues context) |
| **RbacModule** | Permission catalogue, role→permission matrix, permission recomputation | 39, 40 | `roles`, `permissions`, `role_permissions` | Auth | `JwtGuard`, `PermissionGuard`, `DirectorOnlyGuard` |
| **UsersModule** | User CRUD, role assignment, status, salary, safe directory projection | 9, 34, 35, 36, 37, 38 | `users`, `user_roles` | Auth, Rbac, Branches | `JwtGuard`, `PermissionGuard`, `DirectorOnlyGuard` |
| **BranchesModule** | Branch catalogue + scope resolution helpers | 4 | `branches` | Auth | `JwtGuard` |
| **AccountingPeriodsModule** | Period catalogue, date→period resolution, open/closed enforcement | 5 | `accounting_periods`, `period_status_events` | Auth | `JwtGuard`, `PeriodOpenGuard` |
| **MasterDataModule** | Categories / departments / payment methods, aliases, soft delete | 6, 7, 8, 10, 11 | `expense_categories`, `category_aliases`, `departments`, `payment_methods` | Auth, Rbac | `JwtGuard`, `PermissionGuard` |
| **ExpensesModule** | Expense ledger: create, edit, list, detail; snapshots; idempotency | 12, 13, 14, 15 | `expenses` | Auth, Rbac, Branches, Periods, MasterData | `JwtGuard`, `PermissionGuard`, `BranchScopeGuard`, `PeriodOpenGuard` |
| **RevenueModule** | Daily revenue entry + monthly revenue plan | 16–21 | **blocked — see GAP-DB-01**, `revenue_plans` | Auth, Rbac, Branches, Periods | same as Expenses |
| **BudgetsModule** | Budget matrix read/write per period | 22, 23 | `budget_versions`, `budget_lines` | Auth, Rbac, Periods, MasterData | `JwtGuard`, `PermissionGuard`, `PeriodOpenGuard` |
| **ReportsModule** | Dashboard, monthly, branch comparison, cashier report; view-backed | 24–27 | read-only over `v_*` | Auth, Rbac, Branches, Periods | `JwtGuard`, `PermissionGuard`, `BranchScopeGuard` |
| **ImportsModule** | Excel row ingest, per-row validation, dedupe, batch summary | 28 | `import_batches`, `import_rows`, `import_exceptions`, `expenses` | Auth, Rbac, Expenses | `JwtGuard`, `PermissionGuard` |
| **NotificationsModule** | Telegram settings, previews, test send | 29–33 | `system_settings` (+ recipient store, DEC-06) | Auth, Rbac, Reports, Revenue | `JwtGuard`, `PermissionGuard` |
| **AuditModule** *(infrastructure)* | Append-only audit writer, interceptor, actor/correlation context | — (no endpoint) | `audit_logs` | Auth | — |
| **PrismaModule** *(infrastructure)* | Client lifecycle, transaction helper, `fincore` schema binding | — | — | — | — |
| **CommonModule** *(infrastructure)* | DTO validation pipe, `ApiError` filter, money/date value objects | — | — | — | — |

**Boundary notes**

- `RevenuePlansModule` is **not** split out: endpoints 20–21 share the period/branch scope logic with daily revenue, and both are "revenue". Splitting adds a dependency edge for no gain.
- `MonthlyClosingModule` is **not created**: the contract has no close/reopen endpoint. Period state is read-only today. Listed as API-GAP-05.
- `ApprovalsModule` is **not created**: no approval endpoint exists in the contract (see CONFLICT-02).
- `AdministrationModule` is deliberately split into `UsersModule` + `RbacModule` + `MasterDataModule` — a single admin module would mix three different permission domains.
- `AuditModule` is infrastructure, not a feature: it is consumed via an interceptor, never routed.

---

## 9. Authentication Architecture

| Aspect | Contract / mock behaviour | Status | Backend requirement |
|---|---|---|---|
| Credential | `phone` (normalised, strips spaces/`()`/`-`) + `password` | CONFIRMED | Same normalisation server-side |
| Password storage | plaintext `demo123` | **MOCK-ONLY** | Argon2id (or bcrypt ≥12); `users.password_hash` exists |
| Inactive account | login refused; `/me` 401 `ACCOUNT_DISABLED` mid-session | CONFIRMED | Re-check status on every request, not only at login |
| Session transport | `sessionStorage` + `credentials:'include'` | MOCK-ONLY / partially decided | **DEC-04** |
| Token refresh | no endpoint exists | — | Must not be added without a contract change |
| `/me` payload | full user + `permissions[]` + scopes + salary | FRONTEND CONTRACT | Compute effective permissions from `user_roles` → `role_permissions` |
| Logout | 204, clears session | CONFIRMED | Cookie clear and/or refresh-token revocation |

`AuthenticatedUser.permissions` is the **union across all assigned roles**; `branchScopes` = all branches for center roles, else the cashier's branches; `writeBranchScopes` = cashier branches (director: all). This projection is what every frontend guard reads — it must be byte-compatible.

---

## 10. RBAC / Permission Architecture

20 permission codes, all enforced server-side in the mock and all present in the roles UI:

`dashboard.view` · `expense.view_own_branch` · `expense.view_all_branches` · `expense.create` · `expense.edit` · `budget.view` · `budget.create_edit` · `revenue.view_own_branch` · `revenue.view_all_branches` · `revenue.create` · `revenue.edit` · `revenue_plan.manage` · `import.run` · `notification.manage` · `reports.view_cashiers` · `reports.view_own_performance` · `reports.view` · `master_data.manage` · `user.manage` · `role.manage`

Three seeded roles (matching the Excel's 3 real staff): `cashier`, `finance_manager`, `director`.

**Guard chain:** `JwtGuard` → `PermissionGuard` (`@RequirePermission(...)`, OR-semantics for multi-permission routes) → `BranchScopeGuard` → `PeriodOpenGuard`.

Two endpoints need **OR** semantics (12/13, 16/17, 27) and one needs **role-level** escalation checks beyond permissions (39/40, 35, 36, 37 → `DirectorOnlyGuard`).

⚠️ **CONFLICT-03**: `PHASE_16` records DECISION-D as "3 roles seeded, Viewer/Administrator structurally supportable but not seeded". The current permission set was reshaped during frontend work (approval permissions removed, `reports.view_own_performance` / `notification.manage` / `import.run` added). The **permission catalogue in `002_seed_reference.sql` has not been re-verified against these 20 codes.** Backend seed must be reconciled before RBAC is implemented.

---

## 11. Branch Isolation Architecture

Two distinct scopes, already modelled in the contract:

- **`branchScopes`** — what the user may *read*
- **`writeBranchScopes`** — what the user may *write*

| Rule | Behaviour | Status |
|---|---|---|
| Cashier | reads and writes exactly one branch | CONFIRMED |
| Finance manager | reads **all**, writes **own branch only** (Sayxun) | CONFIRMED — verified in e2e |
| Director | reads all; write scope all, but lacks create permissions | CONFIRMED (see CONFLICT-04) |
| "Barchasi" combined view | `branch=all`; if the user has only one scope it silently narrows to that branch | CONFIRMED |
| Branch id source | **sent by the client** in body/query | **SECURITY RISK — SEC-01** |

**SEC-01 (HIGH).** `POST /expenses` and `POST /daily-revenues` accept `branchId` in the body; report endpoints accept `?branch=`. The mock re-validates every one against the user's scopes (403 `BRANCH_SCOPE_DENIED`), and e2e proves a finance manager cannot forge a Xalqlar write. **The contract is not changed here** — but the backend must treat every client-supplied `branchId` as untrusted input and intersect it with the JWT-derived scope. A single missed check is a cross-branch data leak in a financial system.

**Row-level filtering, not just endpoint gating** — `GET /reports/cashiers` returns `scope: 'own'` and filters rows to the requesting cashier so that **other staff salaries never enter the response body**. Verified in-browser. Backend must filter in the query, not in the DTO.

---

## 12. Accounting Period / Monthly Closing Rules

| Rule | Status | Enforcement point |
|---|---|---|
| Period derived from business date, never client-supplied | CONFIRMED | Service |
| Date must map to an existing period → 422 `DATE_OR_PERIOD_INVALID` | CONFIRMED | Service |
| Write to closed period → 409 `PERIOD_LOCKED` | CONFIRMED | `PeriodOpenGuard` + DB trigger |
| Edit: **both** old and new period must be open | CONFIRMED | Service |
| Budget / revenue plan edit on closed period → 409 `PERIOD_CLOSED` | CONFIRMED | Guard |
| Import rejects rows landing in a closed period (batch still commits the rest) | CONFIRMED | Service |
| Timezone | `Asia/Tashkent`; business date is a calendar date, not UTC | CONFIRMED |
| Close / reopen a period | **no endpoint** | API-GAP-05 |

DB has `accounting_periods.closed_at/closed_by/closed_note/reopened_*` and a `period_status_events` audit trail — a **full close/reopen model with no API surface**. Periods can only change state by direct SQL today.

**NEEDS DECISION (DEC-03):** monthly closing was removed from the frontend during the Excel-alignment work. Restoring it is a contract addition. Until decided, `MonthlyClosingModule` is not planned and historical immutability rests on the closed-period guards alone.

---

## 13. Transaction Boundaries

Classified strictly by whether the operation is genuinely atomic.

**REQUIRED (12)**

| Endpoint | Why |
|---|---|
| POST `/expenses` | Idempotency claim + insert + audit row must be one unit |
| PATCH `/expenses/:id` | Optimistic `version` check + update + audit |
| POST `/daily-revenues` | Unique `(branch, date)` claim + insert + audit |
| PATCH `/daily-revenues/:id` | Version check + update + audit |
| PUT `/budget-plans/:periodId/lines` | Multi-row upsert **and delete** (no-plan lines) must not half-apply |
| PUT `/revenue-plans/:periodId` | Multi-branch replace + audit |
| POST `/imports/expenses` | Batch + N rows + N expenses; partial commit would corrupt dedupe state |
| POST `/users` | User + role assignment together |
| PUT `/users/:id/access` | Revoke old + grant new roles; a half-applied change can strand a user with no role |
| PUT `/roles/:role/permissions` | Grant rewrite + cascading permission recomputation |
| POST `/auth/login` | Only if `last_login_at` update is bundled with the audit row |
| PATCH `/users/:id/status` | Status + last-director invariant must be checked and written atomically |

**RECOMMENDED (4):** POST/PATCH `/master/:kind` (write + audit), PUT `/notifications/telegram` (settings + recipients), PATCH `/users/:id/salary` (write + audit).

**NOT NEEDED (24):** every `GET`, plus `POST /auth/logout` and `POST /notifications/telegram/test`.

**Concurrency note:** `expenses`, `budget_versions`, `revenue_plans` and `users` all carry a `version` column — optimistic locking is already designed in. The contract has **no ETag/If-Match**, so version conflicts surface as a 409 the frontend does not yet handle. Low impact at 3 users; recorded as MEDIUM finding SEC-08.

---

## 14. Reporting Architecture

22 views exist. Mapping to the 4 report endpoints:

| Endpoint | Primary views | Fit |
|---|---|---|
| `/reports/monthly` | `v_monthly_expense_report`, `v_expense_plan_vs_actual`, `v_applicable_budget_line` | ✅ direct |
| `/reports/branch-comparison` | `v_branch_comparison`, `v_two_branch_month_matrix` | ✅ direct |
| `/reports/cashiers` | `v_cashier_report`, `v_cashier_channel_breakdown` | ⚠️ needs salary column |
| `/reports/dashboard` | `v_expense_plan_vs_actual` + `v_revenue_plan_vs_actual_center` + `v_profit_loss` | ⚠️ composition + granularity |

**Dashboard-specific work (no view provides these):**
- `granularity=daily|weekly|monthly` bucketing. Weekly = fixed day-ranges 1–7, 8–14, 15–21, 22–28, 29–end. Monthly plan is split across days **without remainder** (Σ daily = monthly exactly) — **CONFIRMED business rule**, unit-tested.
- Annual "Xulosa" block: fixed-cost share %, average monthly spend over **months with actual data only**, peak month, 12-row dynamics table. Mirrors the Excel `Xulosa` sheet — **CONFIRMED**.

**Views with no consumer:** `v_unified_ledger`, `v_revenue_ledger`, `v_revenue_channel_share`, `v_profit_loss`, `v_profit_loss_center`, `v_break_even`, `v_break_even_center`, `v_open_import_exceptions`, `v_period_reconciliation`. See §19.

---

## 15. Break-even Integration

`v_break_even` and `v_break_even_center` **already exist** in `003_report_and_reconciliation_queries.sql`, built on the existing plan/actual and profit/loss views.

- **No new table is recommended or needed.** Break-even is fully derivable from existing sources.
- **The frontend contract has no break-even endpoint.** `contracts.ts` exposes nothing that reads these views, and no UI consumes them.
- The contract is **not modified** by this audit.

Recorded as **API-GAP-01 — FUTURE CONTRACT ADDITION**. When approved, the natural shape is `GET /reports/break-even?period&branch`, served read-only from `v_break_even` / `v_break_even_center`, inside `ReportsModule`, gated by `reports.view`. No schema change, no migration.

---

## 16. Audit Logging Requirements

`audit_logs` already provides: `actor_user_id`, `effective_role`, `branch_id`, `action`, `entity_type`, `entity_id`, `correlation_id`, `before_payload`, `after_payload`, `result` (success/denied/failed), `reason`, `request_ip`, `request_metadata`, `occurred_at`. **No new audit system is invented here.**

**Requires an audit row (17):**

| Operation | Entity | Notes |
|---|---|---|
| login (success **and** failure) | `user` | `result` distinguishes them |
| logout | `user` | |
| expense create / update | `expense` | before/after payload |
| daily revenue create / update | `daily_revenue` | pending GAP-DB-01 |
| budget lines save | `budget_version` | before/after matrix |
| revenue plan save | `revenue_plan` | |
| import batch commit | `import_batch` | imported/skipped/rejected counts |
| master data create / update | `expense_category` \| `department` \| `payment_method` | |
| user create | `user` | |
| user access change | `user_role` | **mandatory** — privilege change |
| user status change | `user` | **mandatory** |
| user salary change | `user` | sensitive financial field |
| role permission change | `role` | **mandatory** — privilege change |
| telegram settings change | `system_settings` | never log the token value |

**Denied attempts must also be logged** (`result='denied'`): every 403 from `BranchScopeGuard`, `PermissionGuard` and `DirectorOnlyGuard`. The mock returns 403 but records nothing — `MOCK-ONLY` gap the backend must close, since forged-`branchId` attempts are exactly what an audit trail is for.

**NEEDS DECISION (DEC-07):** the mock has **no** audit writes at all (the audit module was removed from the frontend during Excel alignment). The DB expects them. Retention period and whether `request_ip` is captured are unspecified.

---

## 17. Security Findings

Derived from this contract and schema only.

| ID | Severity | Finding | Source | Impact | Recommended action |
|---|---|---|---|---|---|
| **SEC-01** | **CRITICAL** | Client supplies `branchId` on expense/revenue create and `?branch=` on every report | contracts.ts, handlers.ts | Cross-branch financial data read/write | Intersect every client `branchId` with JWT-derived scope in a guard; never trust the body |
| **SEC-02** | **CRITICAL** | Import posts fully-resolved rows (category, branch, amount, responsible user) parsed **in the browser** | `/imports/expenses`, `ImportPage.tsx` | Forged rows could inject arbitrary expenses into any branch/period | Re-validate every field server-side per row; reject, never coerce |
| **SEC-03** | HIGH | Effective permissions are returned to the client and drive all UI gating | `/me` | Client-side role trust if the backend omits a check | Every endpoint re-checks permission server-side; UI gating is UX only |
| **SEC-04** | HIGH | Closed-period bypass surface: 5 write endpoints must each independently check period state | handlers.ts | Mutating a closed accounting period | `PeriodOpenGuard` on all writes **plus** a DB trigger as backstop |
| **SEC-05** | HIGH | Salary (`fixedSalaryUzs`) is inside `AuthenticatedUser`, returned by `/me`, `/admin/users`, `/reports/cashiers` | contracts.ts | Staff salary exposure to wrong role | Keep `/users/directory` projection salary-free; enforce `scope:'own'` row filtering in SQL |
| **SEC-06** | MEDIUM | No rate limiting on `/auth/login` | contract | Credential brute force | Per-IP + per-account throttling, lockout after N failures |
| **SEC-07** | MEDIUM | Mass-assignment surface on `PATCH /expenses/:id`, `PUT /users/:id/access` | handlers.ts | Client could attempt to set `branchId`, `enteredBy`, `status` | Strict allow-list DTOs (`whitelist: true, forbidNonWhitelisted: true`) |
| **SEC-08** | MEDIUM | `version` columns exist but the contract has no optimistic-concurrency header | schema vs contract | Silent last-write-wins on concurrent budget edits | Return 409 on version mismatch; decide whether the frontend must handle it |
| **SEC-09** | LOW | Telegram bot token stored in `system_settings` JSONB | §6.10 | Token disclosure via a DB read or backup | Encrypt at rest; never return it (contract already correct) |

**Positive findings worth preserving** (the mock already gets these right and the backend must not regress them): write-only bot token; salary-free user directory; server-derived accounting period; idempotency on both create endpoints; last-director protection; director-only privilege escalation; `scope:'own'` row filtering.

---

## 18. Database Gaps

| ID | Severity | Gap | Source | Impact | Recommended action |
|---|---|---|---|---|---|
| **GAP-DB-01** | **BLOCKER** | No table for **daily revenue** (branch × day, cash/card/transfer split) | endpoints 16–19 vs `001_reference_schema.sql` | 4 endpoints + dashboard revenue half + reminder preview cannot be implemented | Resolve CONFLICT-01 first; then either add `daily_revenues` or derive from `revenue_transactions` |
| **GAP-DB-02** | HIGH | `users` has **no** `fixed_salary_uzs` column | endpoint 38, `/reports/cashiers` | Cashier report and salary editing cannot persist | Add column (or a salary-history table if history is wanted — **DEC-08**) |
| **GAP-DB-03** | MEDIUM | No storage for **per-user Telegram `chatId`** | endpoints 29–33 | Recipients cannot be persisted relationally | Nest in `system_settings` JSONB or add `notification_recipients` — **DEC-06** |
| **GAP-DB-04** | MEDIUM | `budget_lines.planned_amount_uzs` is `NOT NULL`, but the contract needs "no plan line" ≠ "zero plan" | §6.7 | Semantic loss if modelled as a nullable amount | Model no-plan as **row absence**; do not relax the constraint |
| **GAP-DB-05** | LOW | No unique index on `(source_sheet, source_row)` in `expenses` | endpoint 28 | Import dedupe relies on application logic only | Add a partial unique index where `source_sheet IS NOT NULL` |
| **GAP-DB-06** | LOW | No unique index on `expenses.idempotency_key` per actor | endpoint 14 | Idempotency is application-enforced only | Add a partial unique index |

---

## 19. API Contract Gaps

Database capability that exists with **no endpoint**. The contract is deliberately left unchanged.

| ID | Capability | DB artifact | Classification |
|---|---|---|---|
| **API-GAP-01** | Break-even | `v_break_even`, `v_break_even_center` | FUTURE CONTRACT ADDITION (see §15) |
| **API-GAP-02** | Profit & loss | `v_profit_loss`, `v_profit_loss_center` | FUTURE CONTRACT ADDITION — the P&L page was removed during Excel alignment |
| **API-GAP-03** | Reconciliation | `v_period_reconciliation`, `reconciliation_runs` | FUTURE CONTRACT ADDITION |
| **API-GAP-04** | Import exception review / resolve | `import_exceptions`, `v_open_import_exceptions` | FUTURE CONTRACT ADDITION — import currently returns rejects inline, nothing is persisted for later triage |
| **API-GAP-05** | Period close / reopen | `accounting_periods.closed_*`, `period_status_events` | FUTURE CONTRACT ADDITION — see DEC-03 |
| **API-GAP-06** | Expense / revenue reversal | `expense_reversals`, `revenue_reversals` | FUTURE CONTRACT ADDITION — see CONFLICT-02 |
| **API-GAP-07** | Attachments (receipt photos) | `attachments` | FUTURE CONTRACT ADDITION |
| **API-GAP-08** | Report snapshots | `report_snapshots` | FUTURE CONTRACT ADDITION |
| **API-GAP-09** | Revenue channel / cashier channel breakdown | `v_revenue_channel_share`, `v_cashier_channel_breakdown` | Partially served — the daily-revenue row carries the cash/card/transfer split, but no endpoint aggregates by channel |

---

## 20. Conflicts / Needs Decision

| ID | Severity | Description | Sources | Impact | Recommended action |
|---|---|---|---|---|---|
| **CONFLICT-01** | **BLOCKER** | **Two incompatible database architectures exist.** `PHASE_16_DATABASE_ARCHITECTURE.md` (built on approved DECISION-A…E) specifies **17 tables** with `revenue_records` = branch × period × amount. `DATABASE_ARCHITECTURE.md` + `001_reference_schema.sql` specify **28 tables** with `revenue_transactions` = one row per payment, and **never reference DECISION-A…E**. `revenue_records` appears **0 times** in the SQL; `revenue_transactions` appears **0 times** in PHASE_16. The frontend contract uses a **third** shape: branch × day. | Priority 1 vs 3/4 vs 7 | Which schema is authoritative determines the entire revenue module, and whether 11 extra tables exist at all | **Human decision required.** Pick one authoritative schema, then reconcile the daily-revenue grain against it |
| **CONFLICT-02** | HIGH | **Expense approval workflow.** DECISION-B (approved): "schema-supported but **defaults OFF**; new expenses auto-approve". Schema: full `expense_status` + `reviewed_by/at` + `rejection_reason` + `expense_reversals`. Frontend (latest explicit instruction, this session): workflow removed entirely, no status field on `Expense`. | Priority 1 vs 4 vs 7 | Backend must decide whether to write `status='approved'` constantly, or drop the columns | Consistent as-is *if* the workflow stays off — but the DTO omits `status` entirely, so the column needs a server-side default. **Confirm DECISION-B is still in force.** |
| **CONFLICT-03** | HIGH | **Permission catalogue drift.** 20 permission codes are enforced in the mock; `002_seed_reference.sql` has not been verified against them, and 4 codes (`reports.view_own_performance`, `notification.manage`, `import.run` as currently scoped, `reports.view_cashiers`) postdate the seed | handlers.ts vs seed | RBAC seed will not match runtime checks | Re-derive the permission seed from the 20 enforced codes before implementing `RbacModule` |
| **CONFLICT-04** | MEDIUM | **Director capability.** Excel `Rollar` sheet: director "Ma'lumot kiritadi: **Barcha sahifalar**". Current app (explicit instruction, this session): director **cannot** create expenses or daily revenue — planning and oversight only | PROJECT_REQUIREMENTS / Excel vs latest instruction | Role seed and permission grants differ | Latest explicit instruction is priority 1 and should win, but the Excel-derived requirement doc still says otherwise — **confirm and record** |
| **CONFLICT-05** | MEDIUM | **Revenue plan mutability.** Contract: `PUT` replaces the plan in place. Schema: append-only revisions with draft→submitted→approved→locked | Priority 4 vs 7 | Either the DB gains in-place updates or the contract semantics change | Serve the flat contract over the single `is_applicable` revision; decide whether each PUT creates a new revision |
| **CONFLICT-06** | MEDIUM | **Budget versioning.** Same shape as CONFLICT-05 for `budget_versions`/`budget_lines` | Priority 4 vs 7 | Same | Same approach; decide together with CONFLICT-05 |
| **CONFLICT-07** | LOW | **Import pipeline location.** Contract parses .xlsx in the browser and posts rows; schema models a server-side batch pipeline with file hash and preview→approve→commit | Priority 4 vs 7 | `import_batches`/`import_rows` largely unused if the contract stands | **DEC-05** — keep client parsing, or move server-side |
| **CONFLICT-08** | LOW | **Filename mismatch with this brief.** Brief names `001_schema.sql` / `002_seed.sql`; the repository has `001_reference_schema.sql` / `002_seed_reference.sql` | Brief vs repo | Cosmetic; noted so no one assumes a missing file | Use the actual filenames |

**Open decisions summarised:** DEC-02 (plan mutability), DEC-03 (monthly closing), DEC-04 (JWT transport/refresh), DEC-05 (import location), DEC-06 (recipient storage), DEC-07 (audit scope + retention), DEC-08 (salary history).

---

## 21. Proposed Backend Folder Architecture

Structure only — **no code is written in this phase**.

```
backend/
├── prisma/
│   ├── schema.prisma                 # introspected from schema `fincore`
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── decorators/               # @RequirePermission, @CurrentUser, @BranchScope
│   │   ├── guards/                   # JwtGuard, PermissionGuard, BranchScopeGuard, PeriodOpenGuard, DirectorOnlyGuard
│   │   ├── interceptors/             # AuditInterceptor, TransactionInterceptor
│   │   ├── filters/                  # ApiExceptionFilter -> {code, message, details}
│   │   ├── pipes/                    # ValidationPipe (whitelist + forbidNonWhitelisted)
│   │   └── value-objects/            # MoneyUzs (bigint-safe string), BusinessDate (Asia/Tashkent)
│   ├── infra/
│   │   ├── prisma/
│   │   ├── config/                   # env schema, secrets
│   │   └── audit/                    # AuditService (append-only writer)
│   └── modules/
│       ├── auth/
│       ├── rbac/
│       ├── users/
│       ├── branches/
│       ├── accounting-periods/
│       ├── master-data/
│       ├── expenses/
│       ├── revenue/                  # daily revenue + revenue plans
│       ├── budgets/
│       ├── reports/                  # dashboard, monthly, branch-comparison, cashiers
│       ├── imports/
│       └── notifications/
└── test/
    ├── e2e/                          # contract-parity suite against the 40 endpoints
    └── fixtures/                     # ported from src/mocks/fixtures.ts
```

Each module folder: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `mappers/`.

**Error contract:** the frontend's `ApiError` parses `{code, message, details?}` and treats a non-JSON response as `API_UNAVAILABLE`. `ApiExceptionFilter` must emit exactly that shape with `content-type: application/json` for **every** error, including 401/403/404/500.

---

## 22. Backend Development Order

Ordered by dependency and by what is unblocked today.

| Step | Work | Depends on | Gate |
|---|---|---|---|
| **0** | **Resolve CONFLICT-01** — choose the authoritative schema | — | Human decision |
| 1 | Foundation: NestJS skeleton, config, `ApiExceptionFilter`, ValidationPipe, money/date value objects | 0 | — |
| 2 | Database: Prisma introspection of the chosen schema, migration baseline, seed reconciliation (CONFLICT-03) | 1 | — |
| 3 | Auth: login/logout/`/me`, password hashing, JWT (DEC-04) | 2 | DEC-04 |
| 4 | RBAC: permission catalogue, guards, director-only escalation rules | 3 | CONFLICT-03 |
| 5 | Reference + master data: branches, periods, categories/departments/payment methods, user directory | 4 | — |
| 6 | Audit infrastructure: `AuditService` + interceptor, including denied attempts | 4 | DEC-07 |
| 7 | **Expenses** — the safest core module: clean DB target, all rules confirmed | 5, 6 | — |
| 8 | Budgets | 7 | CONFLICT-06 |
| 9 | Users & administration (incl. salary) | 6 | GAP-DB-02 |
| 10 | **Revenue** (daily + plans) | 8 | **GAP-DB-01, CONFLICT-01/05** |
| 11 | Reports: monthly → branch-comparison → cashiers → dashboard | 8, 10 | GAP-DB-02 |
| 12 | Imports | 7 | DEC-05 |
| 13 | Notifications | 10, 11 | GAP-DB-03 |
| 14 | Integration: contract-parity e2e against all 40 endpoints, then flip `VITE_ENABLE_MOCKS=false` | 3–13 | — |

Expenses is deliberately first among feature modules: it is the only large module with **zero** open decisions.

---

## 23. Phase Readiness

| Module | Status | Blocker |
|---|---|---|
| CommonModule / PrismaModule | **READY** | — |
| AuthModule | **NEEDS DECISION** | DEC-04 (token transport/refresh) |
| RbacModule | **NEEDS DECISION** | CONFLICT-03 (permission seed drift) |
| BranchesModule | **READY** | — |
| AccountingPeriodsModule | **READY** (read-only) | close/reopen is API-GAP-05 |
| MasterDataModule | **READY** | — |
| ExpensesModule | **READY** | — |
| BudgetsModule | **NEEDS DECISION** | CONFLICT-06, GAP-DB-04 |
| RevenueModule | **BLOCKED** | GAP-DB-01, CONFLICT-01, CONFLICT-05 |
| ReportsModule | **PARTIALLY READY** | monthly + branch-comparison READY; cashiers blocked by GAP-DB-02; dashboard blocked by GAP-DB-01 |
| ImportsModule | **NEEDS DECISION** | DEC-05, CONFLICT-07 |
| NotificationsModule | **NEEDS DECISION** | GAP-DB-03 / DEC-06 |
| AuditModule | **NEEDS DECISION** | DEC-07 (scope + retention) |

READY: 5 · PARTIALLY READY: 1 · NEEDS DECISION: 6 · BLOCKED: 1

---

## 24. Final Readiness Verdict

The frontend contract is **stable and complete**: 40 endpoints, exact mock parity, every permission enforced server-side in the reference implementation, and a rich set of confirmed business rules (server-derived periods, idempotency, branch scoping, zero-plan vs no-plan semantics, write-only secrets, own-scope row filtering). As a backend specification it is unusually solid.

The database side is **not one thing but two**. Two architecture documents describe two different schemas, only one of which has executable SQL, and the one with SQL does not reference the approved decision set. Layered on top, the frontend's revenue model — branch × **day** — matches neither. Until a human picks the authoritative schema, the revenue module, the dashboard's revenue half, and the notification previews cannot be built, and roughly a third of the endpoints inherit that uncertainty.

Everything else can proceed. Foundation, database wiring, auth, RBAC, reference data, master data, **expenses**, and two of the four reports have clean targets and no unresolved questions beyond the two decisions listed against Auth and RBAC.

**Recommendation:** do not start any module before CONFLICT-01 is settled — not because the other modules depend on it technically, but because the schema choice determines the Prisma baseline that every module is generated from.

---

**PHASE 17 — BACKEND CONTRACT & ARCHITECTURE AUDIT: COMPLETE**

**BACKEND IMPLEMENTATION READINESS: PARTIALLY READY**

**NEXT RECOMMENDED STEP: PHASE 17.1 — DATABASE SOURCE-OF-TRUTH RECONCILIATION & DECISION RESOLUTION** (resolve CONFLICT-01 through CONFLICT-03 and DEC-04; all other work is downstream of those four)
