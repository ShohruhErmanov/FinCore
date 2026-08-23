# PHASE 17.1 — DATABASE SOURCE-OF-TRUTH RECONCILIATION

**Type:** Read / analyze / compare / reconcile / report only.
**Not done in this phase:** no backend code, no NestJS project, no installs, no migrations, no schema edits, no frontend/MSW edits, no file deletions, no rewrites of existing architecture documents.
**Date:** 2026-08-23
**Predecessor:** `docs/BACKEND_IMPLEMENTATION_MAP.md` (Phase 17)

---

## 1. Executive Summary

FinCore does not have one source of truth with gaps in it. It has **three internally coherent stacks** that each run cleanly from a business source down to an implementation, and that contradict each other at the model level.

| | **Stack A — Workflow/TZ** | **Stack B — Excel/Lean** | **Stack C — Approved decisions** |
|---|---|---|---|
| Business source | `PLATFORM_TZ_FROM_GOOGLE_SHEET.md` v1.2 — sheet `10W6K8tb…` | `PROJECT_REQUIREMENTS.md` — sheet `1OWIABt9…` | `PHASE_15_2_BUSINESS_DECISIONS.txt` (DECISION-A…E) |
| API contract | `FRONTEND_API_CONTRACT.md` v1.0 — **55 endpoints** | `src/shared/api/contracts.ts` — **40 endpoints** | — (no API layer defined) |
| Database | `DATABASE_ARCHITECTURE.md` v1.1 + `001_reference_schema.sql` — **28 tables** | — (no schema) | `PHASE_16_DATABASE_ARCHITECTURE.md` — **17 tables** |
| Expense approval | Full: submit/approve/reject/correct | Absent | Schema-supported, **defaults OFF** |
| Revenue grain | Per payment (`revenue_transactions`) | Per **branch × day** (`DailyRevenue`) | Per **branch × period** (`revenue_records`) |
| Period close | `POST /periods/:id/close` + `/reopen` | Absent | Not addressed |

**Two different source workbooks.** Stack A derives from Google Sheet `10W6K8tbQ5KjHVC2tTG8CFrBlCVnMYTp0PbPLKzUZtCc` ("Kopiya Moliya reja" + a product-owner addition covering branch revenue and cashiers). Stack B derives from Google Sheet `1OWIABt9nsVXcwhVh9ZfUTOtHjDgaF-9K6mcVvvbm8so` (12 worksheets, **expense-only** — it contains no revenue data at all). This single fact explains almost every downstream divergence.

**Endpoint overlap is 19.** Of 55 documented and 40 implemented endpoints, only 19 exist in both. 36 are documented-only, 21 are implemented-only.

**No document is marked SUPERSEDED or DEPRECATED anywhere in `docs/`.** Verified by grep. Therefore no stack can be discarded on documentary grounds, and Phase 17.1 cannot resolve this without a human decision.

**Everything that is common to all three stacks is ready to build.** Auth, RBAC, branches, accounting periods (read), master data and the expense ledger are unambiguous, evidence-backed, and blocked by nothing.

---

## 2. Authoritative Source Map

| Category | Authoritative file | Status | Reason |
|---|---|---|---|
| Business requirements (Excel-derived) | `docs/PROJECT_REQUIREMENTS.md` | **ACTIVE — contested** | Self-declares "Business Source of Truth"; supersedes Figma-only inference. Expense-only scope. Different workbook from the TZ. |
| TZ / platform spec | `docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md` v1.2 (2026-08-20) | **ACTIVE — contested** | Named as Priority 2 in the Phase 17 brief; different workbook, adds revenue + cashier scope |
| Approved business decisions | `docs/PHASE_15_2_BUSINESS_DECISIONS.txt` (DECISION-A…E) | **ACTIVE** | Priority 1. Content recorded in PHASE_16 §"Approved decisions" |
| Decision register | `docs/PHASE_15_1_DECISION_REGISTER.md` | **ACTIVE — informational only** | Line 12: *"Nothing in this document is a resolution. Every item ends in `Status: OPEN`."* Cannot be used as an authority |
| Database architecture | `docs/DATABASE_ARCHITECTURE.md` v1.1 (2026-08-21) | **ACTIVE — contested** | Self-declares "yagona ishonchli manba"; paired with executable SQL; derived from PLATFORM_TZ. **Never references DECISION-A…E** |
| Database architecture (alt.) | `docs/PHASE_16_DATABASE_ARCHITECTURE.md` | **ACTIVE — contested** | Explicitly built on DECISION-A…E (Priority 1) but has **no executable SQL** and is not referenced by the SQL |
| Executable SQL — schema | `docs/database/001_reference_schema.sql` | **ACTIVE / EXECUTABLE** | 28 tables, 15 enums. The only physical schema that exists |
| Executable SQL — seed | `docs/database/002_seed_reference.sql` | **ACTIVE / EXECUTABLE** | Permission catalogue **NOT VERIFIED** against the 20 enforced codes |
| Executable SQL — reporting | `docs/database/003_report_and_reconciliation_queries.sql` | **ACTIVE / EXECUTABLE** | 22 views incl. `v_break_even`, `v_break_even_center` |
| Executable SQL — verification | `docs/database/004_verification.sql` | ACTIVE | Not read (not required for reconciliation) |
| API contract — document | `docs/FRONTEND_API_CONTRACT.md` v1.0 (2026-08-21) | **ACTIVE — contested** | 55 endpoints; derived from PLATFORM_TZ §7; aligns with Stack A |
| API contract — code | `src/shared/api/contracts.ts` | **ACTIVE — contested** | 40 endpoints; the contract the running frontend actually calls |
| MSW reference implementation | `src/mocks/handlers.ts` | ACTIVE | 40 routes, exact parity with `contracts.ts` |
| Frontend domain models | `src/shared/types/domain.ts` | ACTIVE | Types consumed by every page and guard |
| Phase 17 audit | `docs/BACKEND_IMPLEMENTATION_MAP.md` | ACTIVE | Predecessor of this document |
| Migration & operations | `docs/DATABASE_MIGRATION_AND_OPERATIONS.md` v1.0 | ACTIVE | Not read this phase |
| Figma / design specs | `PHASE_15_DEVELOPMENT_SPECIFICATION.md`, `FIGMA_TZ_CONFORMANCE_ANALYSIS.md` | ACTIVE — Priority 8 | Design assumptions only; not used to resolve anything |
| Frontend architecture / plan / matrix | `FRONTEND_ARCHITECTURE.md`, `FRONTEND_IMPLEMENTATION_PLAN.md`, `FRONTEND_ACCEPTANCE_MATRIX.md` | ACTIVE | Not required for reconciliation |
| Which stack is authoritative | — | **NOT VERIFIED** | No document declares precedence over another |

---

## 3. Source Priority Applied

The brief's priority order was applied literally. It does not resolve the conflict, for a structural reason worth stating plainly:

- **Priority 1** (approved decisions) points at **Stack C**.
- **Priority 2** (authoritative TZ / business requirements) is satisfied by **two different files** describing **two different workbooks** — one supporting Stack A, one supporting Stack B.
- **Priority 3–4** (database architecture + executable SQL) point at **Stack A**.
- **Priority 5** (approved API contract) is ambiguous: `FRONTEND_API_CONTRACT.md` (Stack A) or `contracts.ts` (Stack B) — the brief does not say which is "the approved API contract".
- **Priority 6–7** (MSW, frontend types) point at **Stack B**.

Higher priority therefore points at Stack C, mid priority splits between A and B, and lower priority points firmly at B — while the only executable artifacts (SQL) belong to A.

Per instruction, this is recorded as a conflict and **not resolved here**.

---

## 4. API Contract vs Database

Compact, domain by domain. Naming differences (`branchId` ↔ `branch_id`, `amountUzs` ↔ `amount_uzs`) are **NORMAL MAPPING** throughout and are not repeated per row.

### 4.1 Authentication

**API (both stacks):** `POST /auth/login`, `POST /auth/logout`, `GET /me`
**DB:** `users`, `user_roles`, `roles`, `role_permissions`, `permissions`
**MATCH: FULL**
Issues: `password_hash` exists; MSW compares plaintext (`MOCK-ONLY`). Token transport/refresh unspecified in both contracts.
**SEVERITY: LOW** · **ACTION:** DEC-04 (JWT transport) before implementation.

### 4.2 Users

**API:** `/users/directory`, `/admin/users`, `POST /users`, `PUT /users/:id/access`, `PATCH /users/:id/status`, **`PATCH /users/:id/salary`** *(code-only)*
**DB:** `users`, `user_roles`
**MATCH: PARTIAL**
Real conflict: API returns `fixedSalaryUzs`; **`users` has no salary column** and no salary concept exists in any DB document.
**SEVERITY: HIGH** · **ACTION:** add `fixed_salary_uzs` (or a salary-history table — DEC-08) once the schema owner is decided.

### 4.3 Roles

**API:** `GET /roles/permissions`, `PUT /roles/:role/permissions` *(code-only; absent from the doc contract)*
**DB:** `roles`, `role_permissions`, `permissions`
**MATCH: FULL (structure)**
Real conflict: the 20 permission codes enforced at runtime have **not** been verified against `002_seed_reference.sql`. Four codes postdate the seed.
**SEVERITY: HIGH** · **ACTION:** re-derive the permission seed from the enforced set.

### 4.4 Permissions

**API:** exposed only as `AuthenticatedUser.permissions[]`
**DB:** `permissions` + `role_permissions`
**MATCH: FULL** · **SEVERITY: —**
Note: effective permissions = union across all assigned roles. `roles.allows_all_branch_scope` exists in DB and has no API counterpart — used server-side only.

### 4.5 Organizations

**API:** none · **DB:** none · **MATCH: N/A**
Single-tenant confirmed by DECISION-E: no `organization_id`/`tenant_id` anywhere. Consistent across all three stacks.
**CLASSIFICATION: DEFERRED / OUT OF SCOPE.**

### 4.6 Branches

**API:** `GET /branches` (both stacks)
**DB:** `branches` (dynamic entity, not enum — DECISION-A)
**MATCH: FULL** · **SEVERITY: —**
Consistent in all three stacks. Branch is seeded with 2 rows, no admin CRUD endpoint in either contract — intentional per DECISION-A.

### 4.7 Accounting Periods

**API (code):** `GET /periods` only — read-only
**API (doc):** `GET /periods`, `GET /periods/:id/readiness`, `POST /periods/:id/close`, `POST /periods/:id/reopen`
**DB:** `accounting_periods` (+ `closed_at/by/note`, `reopened_at/by/reason`) and `period_status_events`
**MATCH: PARTIAL**
Real conflict: DB and the doc contract model a full close/reopen lifecycle; the implemented contract has no way to change period state at all.
**SEVERITY: MEDIUM** (not a blocker — closed-period *enforcement* works today; only state *transition* is missing)
**ACTION:** DEC-03.

### 4.8 Expense Categories

**API:** `GET /master/categories`, `POST /master/:kind`, `PATCH /master/:kind/:id` *(code-only mutations)*
**DB:** `expense_categories`, `category_aliases`
**MATCH: FULL**
`aliases` is exposed on the DTO and backed by `category_aliases` — used by the Excel import name matcher.
**SEVERITY: —**

### 4.9 Expenses

**API (code):** `GET /expenses`, `GET /expenses/:id`, `POST /expenses`, `PATCH /expenses/:id`
**API (doc, additional):** `POST /expenses/:id/submit|approve|reject|correct`
**DB:** `expenses` (32 columns)

Field reconciliation:

| Frontend type | DB column | Status |
|---|---|---|
| `transactionDate`, `branchId`, `categoryId`, `description`, `amountUzs`, `paymentMethodId`, `departmentId`, `responsibleUserId`, `comment`, `enteredBy`, `createdAt`, `updatedAt` | direct equivalents | NORMAL MAPPING |
| `periodId` | `accounting_period_id` | NORMAL MAPPING |
| `categoryCodeSnapshot`, `categoryNameSnapshot`, `expenseTypeSnapshot` | same, snapshotted | NORMAL MAPPING |
| `branchName`, `paymentMethodName`, `departmentName`, `responsibleUserName`, `enteredByName` | JOIN-derived display names | NORMAL MAPPING (computed) |
| `sourceSheet`, `sourceRow` | same | NORMAL MAPPING |
| — | `status`, `reviewed_by`, `reviewed_at`, `rejection_reason` | **DATABASE FEATURE NOT EXPOSED** |
| — | `is_reversed`, `reversed_at`, `reversed_by`, `reversal_reason` | **DATABASE FEATURE NOT EXPOSED** |
| — | `idempotency_key` | accepted on input, not returned — correct |
| — | `source_workbook`, `import_batch_id`, `updated_by`, `version` | DATABASE FEATURE NOT EXPOSED (infrastructure) |

**MATCH: PARTIAL** — every implemented field maps cleanly; the divergence is entirely *unexposed DB capability*.
**SEVERITY: MEDIUM** · **ACTION:** confirm DECISION-B is still in force (workflow OFF → `status` gets a server-side default and stays unexposed).

### 4.10 Revenue

**API (code):** `GET/POST/PATCH /daily-revenues` — **branch × day**, with `cashUzs`/`cardUzs`/`transferUzs` split, unique on `(branchId, businessDate)`
**API (doc):** `GET/POST /revenue-transactions`, `POST /revenue-transactions/:id/reverse` — **per payment**, with `receipt_no`, `collector_user_id`, `entered_on_behalf`
**DB (Stack A):** `revenue_transactions` (26 columns, per payment) + `revenue_reversals`
**DB (Stack C):** `revenue_records` (branch × period) — **appears 0 times in the SQL**

**MATCH: NONE** — three different grains, no shared table.
**REAL CONFLICT / BLOCKER.**
**SEVERITY: BLOCKER** · **ACTION:** BLK-02.

Note: daily revenue is *derivable* from `revenue_transactions` by aggregation, but the reverse is not true — the implemented model cannot produce receipt-level rows, and its `(branch, date)` uniqueness rule has no home in the per-payment schema.

### 4.11 Budget

**API (code):** `GET /budget-plans/:periodId`, `PUT /budget-plans/:periodId/lines` — flat, directly editable
**API (doc):** `/budget-periods/:periodId/versions`, `/budget-versions/:id`, `+/submit|approve|recall`, `PUT /budget-versions/:id/lines`
**DB:** `budget_versions` (revision_no, status draft→submitted→approved→locked, `is_applicable`) + `budget_lines`
**MATCH: PARTIAL**
Mapping gap (not a conflict): the flat contract can be served over the single `is_applicable` revision.
Real constraint: `budget_lines.planned_amount_uzs` is `NOT NULL`, so "no plan line" **must** be modelled as row absence — the contract's `hasPlan=false` vs `plannedAmountUzs='0'` distinction is load-bearing and e2e-covered.
**SEVERITY: MEDIUM** · **ACTION:** DEC-02 (does each `PUT` create a revision or update in place?).

### 4.12 Reports

**API (code):** `/reports/dashboard`, `/reports/monthly`, `/reports/branch-comparison`, `/reports/cashiers`
**API (doc, additional):** `/reports/profit-loss`, `/reports/revenue`, `/reports/data-quality`
**DB:** 22 views

| Endpoint | View | Status |
|---|---|---|
| `/reports/monthly` | `v_monthly_expense_report`, `v_expense_plan_vs_actual` | READY |
| `/reports/branch-comparison` | `v_branch_comparison`, `v_two_branch_month_matrix` | READY (MSW currently returns hardcoded figures — `MOCK-ONLY`) |
| `/reports/cashiers` | `v_cashier_report`, `v_cashier_channel_breakdown` | PARTIAL — blocked by missing salary column |
| `/reports/dashboard` | composite | PARTIAL — revenue half blocked; `granularity=daily/weekly/monthly` has no view |
| `/reports/profit-loss` | `v_profit_loss`, `v_profit_loss_center` | IMPLEMENTATION GAP — view ready, no code endpoint |
| `/reports/revenue` | `v_revenue_plan_vs_actual`, `v_revenue_channel_share` | IMPLEMENTATION GAP |
| `/reports/data-quality` | `v_open_import_exceptions` | IMPLEMENTATION GAP |

**SEVERITY: MEDIUM**

### 4.13 Break-even

See §10. **DATABASE READY / API CONTRACT MISSING IN BOTH STACKS.**

### 4.14 Dashboard

Covered by 4.12. Additional finding: the annual "Xulosa" block (fixed-cost share, average monthly over months-with-data, peak month, 12-month dynamics) is implemented in the frontend and mirrors the Excel `Xulosa` sheet, but **no view provides it** — it is service-layer composition.
**CLASSIFICATION: IMPLEMENTATION GAP** · **SEVERITY: LOW**

### 4.15 Approval

**API (code):** none · **API (doc):** 10 endpoints (expense ×4, budget ×3, revenue-plan ×3)
**DB:** status enums + reviewer/approver columns on `expenses`, `budget_versions`, `revenue_plans`
**MATCH: NONE in the implemented stack**
**CLASSIFICATION: REAL CONFLICT** — DECISION-B says schema-supported/default-OFF, which is *compatible* with the implemented stack; the doc contract's 10 endpoints are not.
**SEVERITY: MEDIUM** · **ACTION:** DEC-01 (bundled with BLK-01).

### 4.16 Audit

**API (code):** none · **API (doc):** `GET /audit-logs`
**DB:** `audit_logs` (15 columns, incl. `before_payload`/`after_payload`/`result`/`correlation_id`)
**MATCH: NONE**
The MSW mock performs **no audit writes at all**. The DB expects them for at least 17 operations (see Phase 17 §16).
**CLASSIFICATION: IMPLEMENTATION GAP** (writing) + **REAL CONFLICT** (reading — endpoint exists in one contract only)
**SEVERITY: HIGH** for writes (privilege changes and financial mutations are unlogged), MEDIUM for the read endpoint.
**ACTION:** DEC-07.

### 4.17 Other domains present

| Domain | API (code) | API (doc) | DB | Status |
|---|---|---|---|---|
| Master data (departments, payment methods) | ✔ | ✖ | `departments`, `payment_methods` | READY |
| Import | `POST /imports/expenses` (client-parsed rows) | `POST /imports/sheets`, `/imports/legacy-normalize`, `GET /imports/latest` | `import_batches`, `import_rows`, `import_exceptions` | PARTIAL — DEC-05 |
| Reconciliation | ✖ | `GET /reconciliations` | `reconciliation_runs`, `v_period_reconciliation` | IMPLEMENTATION GAP |
| Notifications (Telegram) | 5 endpoints | ✖ | `system_settings` only | PARTIAL — no store for per-user `chatId` (DEC-06) |
| Exports | ✖ | `POST /exports`, `GET /exports/:id`, `/download` | none | DEFERRED — CSV is generated client-side today |
| Attachments | ✖ | ✖ | `attachments` | DEFERRED — DB-only capability |
| Report snapshots | ✖ | ✖ | `report_snapshots` | DEFERRED — DB-only capability |

---

## 5. MSW vs Real Backend

Assessment of `src/mocks/handlers.ts` as reference behaviour.

### DIRECTLY REUSABLE (business rules confirmed by an authoritative source)

| Rule | Evidence |
|---|---|
| Accounting period derived server-side from business date; never client-supplied | TZ + DB (`accounting_period_id` FK), e2e-covered |
| Write to closed period → 409 | TZ, DB `period_status`, e2e-covered |
| Edit requires **both** old and new period open | handlers + DB |
| `Idempotency-Key` header must equal `body.idempotencyKey`; replay returns original with 200 | `expenses.idempotency_key` exists in DB; e2e-covered |
| Category/payment-method/department must be **active** at write time | DB `is_active` |
| Category code/name/type snapshotted onto the row | DB snapshot columns |
| Soft delete only (`isActive=false`); no hard delete anywhere | DB, all master tables |
| Duplicate master `code` → 409 | DB unique indexes |
| Only a director may grant the director role | Excel `Rollar` + DECISION-D |
| Last active director cannot be removed or deactivated | Excel `Rollar` |
| Director role cannot be combined with another role | DECISION-D |
| Cashier role requires an active branch; center roles require `branch_id = null` | DB `user_roles.branch_id` nullable |
| `/users/directory` returns a salary/phone/permission-free projection | e2e `safe-directory.spec.ts` |
| Telegram bot token is write-only (`botTokenSet` boolean on read) | verified in-browser |
| `/reports/cashiers` filters rows to self when `scope='own'` | verified in-browser |
| Zero plan ≠ no plan line | e2e `acceptance-budget.spec.ts` |
| Monthly plan splits into daily buckets with **no remainder** | unit-tested |

### NEEDS ADAPTATION (correct behaviour, needs DB integration)

- All in-memory arrays → Prisma queries.
- `buildBudgetPlan()` synthesises the category × branch grid on read → serve via `v_expense_plan_vs_actual` / `v_applicable_budget_line`.
- `buildDashboard()` / `buildAnnualSummary()` / `buildTrends()` → view composition + service-layer bucketing.
- `buildCashierReport()` → `v_cashier_report` + the salary column once it exists.
- Effective-permission recomputation after a role change → recompute on read or invalidate cache.

### CONFLICTS WITH DATABASE

- **Daily revenue storage** — no table (BLK-02).
- **`fixedSalaryUzs`** — no column (CNF-04).
- **Per-user Telegram `chatId`** — no relational home (CNF-07).
- **Flat budget / revenue-plan replace** vs revisioned append-only DB (CNF-05).

### NOT AUTHORITATIVE (mock assumption, unconfirmed by any business source)

- Plaintext `demo123`, `sessionStorage` session, `exp-mock-N` ids.
- `GET /reports/branch-comparison` returning **hardcoded** monthly figures rather than reading the ledger.
- `POST /notifications/telegram/test` returning `{delivered:false, note:'DEMO_NO_BACKEND'}`.
- Salary values in fixtures (15/8/4.5/4.5/4.2 mln) — invented for the demo, not from any business source.
- Revenue seed amounts and the `historicalMonthly` Jan–Jun aggregates — demo data.
- **Absence of audit writes** — this is a mock omission, not a business rule.

---

## 6. Database vs Frontend Types

Per-entity field reconciliation. `NORMAL MAPPING` = case/naming/JOIN/computed transformation only.

| Entity | DB field | API field | MSW | Frontend type | Status |
|---|---|---|---|---|---|
| Expense | `amount_uzs` | `amountUzs` | ✔ | `MoneyUzs` (string) | NORMAL MAPPING — `bigint`-safe string is deliberate |
| Expense | `accounting_period_id` | `periodId` | ✔ | `UUID` | NORMAL MAPPING |
| Expense | `expense_type_snapshot` | `expenseTypeSnapshot` | ✔ | `ExpenseType` | NORMAL MAPPING |
| Expense | `status` | MISSING | MISSING | MISSING | **DATABASE FEATURE NOT EXPOSED** — decision required (DEC-01) |
| Expense | `is_reversed`, `reversal_reason` | MISSING | MISSING | MISSING | DATABASE FEATURE NOT EXPOSED |
| Expense | `version` | MISSING | MISSING | MISSING | DATABASE FEATURE NOT EXPOSED — no optimistic-concurrency header in either contract |
| User | `password_hash` | MISSING | plaintext | MISSING | Correct — must never be exposed |
| User | MISSING | `fixedSalaryUzs` | ✔ | `MoneyUzs` | **API FEATURE NOT IN DATABASE** — CNF-04 |
| User | `status` | `status` | ✔ | `UserStatus` | NORMAL MAPPING |
| UserRole | `branch_id` (nullable) | `roles[].branchId` | ✔ | `RoleAssignment` | NORMAL MAPPING |
| Branch | `code`, `name`, `is_active` | `code`, `name`, `isActive` | ✔ | `Branch` | NORMAL MAPPING. Frontend narrows `code` to `'SAYXUN' \| 'XALQLAR'` — a **type-level hardcode** contradicting the dynamic-branch model (CNF-08, LOW) |
| AccountingPeriod | `year`, `month`, `status` | same + `label` | ✔ | `AccountingPeriod` | NORMAL MAPPING; `label` is computed |
| AccountingPeriod | `closed_at`, `closed_by` | `closedAt`, `closedByName` | ✔ | ✔ | NORMAL MAPPING |
| AccountingPeriod | `reopened_at`, `reopen_reason` | MISSING | MISSING | MISSING | DATABASE FEATURE NOT EXPOSED |
| BudgetLine | `planned_amount_uzs` NOT NULL | `plannedAmountUzs: MoneyUzs \| null` | ✔ | ✔ | **SEMANTIC CONSTRAINT** — null must map to row absence, not a null column (CNF-06) |
| BudgetVersion | `revision_no`, `status`, `is_applicable` | MISSING | MISSING | MISSING | DATABASE FEATURE NOT EXPOSED (CNF-05) |
| RevenuePlan | `revision_no`, `status` | MISSING | MISSING | MISSING | DATABASE FEATURE NOT EXPOSED (CNF-05) |
| RevenuePlan | `planned_amount_uzs` | `plannedAmountUzs` | ✔ | ✔ | NORMAL MAPPING |
| — | MISSING | `dailyPlanUzs`, `daysInMonth` | ✔ | ✔ | COMPUTED — correctly not stored |
| DailyRevenue | **no table** | `cashUzs`/`cardUzs`/`transferUzs`/`totalUzs` | ✔ | `DailyRevenue` | **BLOCKER (BLK-02)** |
| RevenueTransaction | `receipt_no`, `collector_user_id`, `entered_on_behalf` | MISSING in code | MISSING | MISSING | DATABASE FEATURE NOT EXPOSED |
| AuditLog | all 15 columns | MISSING in code | MISSING | MISSING | DATABASE FEATURE NOT EXPOSED (CNF-09) |
| SystemSettings | `key`, `value` JSONB | Telegram DTO | ✔ | `TelegramSettings` | PARTIAL — recipients have no home (CNF-07) |

---

## 7. Authentication & Authorization Reconciliation

| Layer | State | Consistent? |
|---|---|---|
| Frontend permission logic | `useAuth().hasPermission(code)`; `PermissionRoute` accepts a single code or an array (OR) | ✔ |
| API contract | `AuthenticatedUser` carries `permissions[]`, `branchScopes[]`, `writeBranchScopes[]` | ✔ |
| MSW behaviour | Every route re-checks permission server-side; UI gating is never the only gate | ✔ |
| DB schema | `users` → `user_roles` → `roles` → `role_permissions` → `permissions`; fully extensible | ✔ |

**Structurally consistent across all four layers.** The RBAC model is one of the few areas where every stack agrees.

Open items:

- **Permission catalogue drift (CNF-02, HIGH).** 20 codes are enforced at runtime; `002_seed_reference.sql` has not been verified against them. `reports.view_own_performance`, `notification.manage`, `import.run` and `reports.view_cashiers` postdate the seed.
- **DEC-04 (token transport).** No refresh endpoint exists in either contract. `api.ts` sends `credentials:'include'` and the login page states production uses HTTP-only cookies — consistent, but never formally decided.
- **Combined role is not hardcoded** — Madina holds `finance_manager` + `cashier@Sayxun` as two rows in `user_roles`, and permissions are unioned. Matches the "no special combined role" requirement. ✔
- **Viewer / Administrator** appear only in Figma-derived docs. DECISION-D: structurally supportable, **not seeded**. Treated here as **DEFERRED / OUT OF SCOPE**, not as V1 roles. ✔

---

## 8. Branch & Organization Scoping

**Organization/tenancy:** no `organization_id` or `tenant_id` in the schema, the contract, the MSW layer or the frontend types. Single-tenant per DECISION-E. Multi-tenant is **not** introduced by this audit. ✔ Consistent.

**Branch model:** dynamic entity (`branches` table), seeded with 2 rows, no admin CRUD endpoint — DECISION-A. ✔ Consistent across all stacks.

**Two-scope model** (read vs write) is implemented consistently:

| Role | `branchScopes` (read) | `writeBranchScopes` (write) | Verified |
|---|---|---|---|
| Kassir | own branch | own branch | e2e |
| Moliya rahbari | all branches | own branch only (Sayxun) | e2e `write-scope-idempotency-period.spec.ts` |
| Direktor | all branches | all branches, but holds no create permission | in-browser |

**"Barchasi" combined view:** `branch=all`; when the user has exactly one scope the server silently narrows to that branch (`scopedBranchFilter`). Consistent between MSW and report filtering. ✔

**Finding CNF-01 (HIGH, carried from Phase 17):** `branchId` arrives from the client on both create endpoints and as `?branch=` on every report. MSW re-validates against the user's scopes and returns 403 `BRANCH_SCOPE_DENIED`. **The contract is not changed here** — the backend must intersect every client-supplied branch with the JWT-derived scope. Report row filtering (`scope:'own'` in the cashier report) must happen **in SQL**, not in the DTO.

**CNF-08 (LOW):** `Branch.code` is typed `'SAYXUN' | 'XALQLAR'` in `domain.ts` — a literal union that contradicts the dynamic-branch decision. Harmless today (2 branches, no add-branch UI), but a third branch would require a frontend type change. Recorded, not fixed.

---

## 9. Accounting Period Reconciliation

| Aspect | Frontend / API | Database | Status |
|---|---|---|---|
| Identity | `periodId` (UUID) on every transaction DTO | `accounting_periods.id` | NORMAL MAPPING |
| Selection | `?period=<uuid>` on dashboard/reports/budget/revenue-plan | FK | NORMAL MAPPING |
| Derivation on write | Client sends **`transactionDate` / `businessDate` only**; server resolves the period | `accounting_period_id` FK | ✔ **No ambiguity** — the client never sends a period on create |
| Month/year | `year`, `month` returned for display; `label` computed | `year SMALLINT`, `month SMALLINT` | NORMAL MAPPING |
| Timezone | `Asia/Tashkent` business date | `DATE` | ✔ Consistent |
| Expense period | derived | `expenses.accounting_period_id` | ✔ |
| Revenue period | derived | **no daily-revenue table** | BLOCKED (BLK-02) |
| Budget period | `budget-plans/:periodId` | `budget_versions.period_id` | ✔ |
| Report period | `?period=` | view parameter | ✔ |
| Closed-period enforcement | 409 `PERIOD_LOCKED` / `PERIOD_CLOSED` on 5 write endpoints | `period_status` enum | ✔ Consistent |
| **Period closing** | **no endpoint in the implemented contract** | `closed_*`, `reopened_*`, `period_status_events` | **IMPLEMENTATION GAP** (CNF-03) |

**No ambiguity found** in month/year ↔ period_id mapping: the direction is always "date in → period resolved server-side", never "period in". This is the safe direction and is consistent everywhere.

Historical immutability today rests entirely on the closed-period guards; there is no way to *close* a period through the API, so in practice nothing is ever locked. **DEC-03.**

---

## 10. Break-even Reconciliation

The approved formula is treated as settled and is **not** re-discussed.

**Database layer — READY.** `v_break_even` (branch level) and `v_break_even_center` (center level) exist in `003_report_and_reconciliation_queries.sql`, built on the existing plan/actual and profit-loss views. Their output columns match the approved formula exactly:

| Formula term | View column | Present |
|---|---|---|
| Fixed Costs | `fixed_cost_total_uzs` | ✔ |
| Variable Costs | `variable_cost_total_uzs` | ✔ |
| Revenue | `actual_revenue_uzs` | ✔ |
| Contribution Margin | `contribution_margin_uzs` | ✔ |
| Contribution Margin Ratio | `contribution_margin_ratio` | ✔ |
| Break-even Point | `break_even_point_uzs` | ✔ |
| Margin of Safety % | `margin_of_safety_pct` | ✔ |
| — | `break_even_status` | ✔ (derived label) |
| — | `period_id`, `branch_id`, `branch_name` | ✔ (scoping) |
| — | `exception_id` (center view) | ✔ (reconciliation link) |

**Answers to the five checks:**

1. **Does the API contract expect a break-even endpoint?** **No** — neither `contracts.ts` (40 endpoints) **nor** `FRONTEND_API_CONTRACT.md` (55 endpoints) contains one. Verified by full endpoint extraction of both.
2. **Frontend type?** **No** — `domain.ts` has no break-even type.
3. **MSW mock?** **No** — no handler.
4. **Dashboard/report integration?** **No** — no page consumes it.
5. **Response DTO ↔ view match?** **N/A** — no DTO exists to compare.

**STATUS: DATABASE READY — API CONTRACT MISSING (in both contracts).**

Fixed/variable classification relies on `expenses.expense_type_snapshot`, which the implemented stack already populates correctly. Revenue input depends on the revenue model — **break-even inherits BLK-02**: the formula's `Revenue` term currently reads `revenue_transactions`, which the implemented stack does not write to.

**CLASSIFICATION: IMPLEMENTATION GAP + FUTURE CONTRACT ADDITION.** No new table is needed or recommended. When approved, the natural shape is `GET /reports/break-even?period&branch` inside `ReportsModule`, read-only, gated by `reports.view`.

---

## 11. Conflict Register

### BLOCKERS (backend implementation cannot responsibly start)

| ID | Description | Sources | Impact |
|---|---|---|---|
| **BLK-01** | **Which API contract is authoritative?** `FRONTEND_API_CONTRACT.md` (55 endpoints, full workflow) vs `src/shared/api/contracts.ts` (40 endpoints, no workflow). Only **19** endpoints are common. Neither is marked superseded. | Priority 5 ambiguous | Determines every controller, DTO and guard. Building against the wrong one wastes the whole phase |
| **BLK-02** | **Which database schema is authoritative, and what is the revenue grain?** `001_reference_schema.sql` (28 tables, `revenue_transactions` per payment) vs `PHASE_16` (17 tables, `revenue_records` per period) vs the implemented `DailyRevenue` (per branch × day). **No schema contains the implemented grain.** | Priority 1 vs 3/4 vs 6/7 | Determines the Prisma baseline every module is generated from; 6 endpoints have no target at all |
| **BLK-03** | **Which business source is authoritative?** Two different Google Sheets workbooks (`1OWIABt9…` expense-only vs `10W6K8tb…` + revenue/cashier addition) are each cited as the business source of truth by a different document. | Priority 2 satisfied twice | Root cause of BLK-01 and BLK-02; deciding this likely resolves both |

BLK-01, BLK-02 and BLK-03 are **one decision with three faces**. Resolving BLK-03 should cascade.

### REAL CONFLICTS (two authoritative sources disagree; not blocking)

| ID | Description | Severity |
|---|---|---|
| **CNF-01** | Client-supplied `branchId` on writes and `?branch=` on reports; safe only because MSW re-validates. Backend must enforce identically | HIGH (security) |
| **CNF-02** | 20 runtime permission codes not verified against `002_seed_reference.sql`; 4 codes postdate the seed | HIGH |
| **CNF-03** | Period close/reopen exists in DB + doc contract, absent from the implemented contract | MEDIUM |
| **CNF-04** | `fixedSalaryUzs` in API/frontend, **no column** in any DB document | HIGH |
| **CNF-05** | Budget & revenue-plan: flat in-place replace (contract) vs revisioned append-only (DB) | MEDIUM |
| **CNF-09** | `audit_logs` expected by DB for ≥17 operations; MSW writes **none**; read endpoint exists in the doc contract only | HIGH (writes) |
| **CNF-10** | Expense approval: DECISION-B says schema-supported/default-OFF; doc contract exposes 4 workflow endpoints; implemented contract exposes none | MEDIUM |
| **CNF-11** | Director capability: Excel `Rollar` says director enters data on "Barcha sahifalar"; implemented app forbids director data entry | MEDIUM |

### MAPPING GAPS (same semantics, transformation required — not conflicts)

| ID | Description |
|---|---|
| MAP-01 | camelCase ↔ snake_case throughout |
| MAP-02 | `periodId` ↔ `accounting_period_id` |
| MAP-03 | Display names (`branchName`, `enteredByName`, …) are JOIN-derived |
| MAP-04 | `MoneyUzs` string ↔ `bigint`/domain type — deliberate precision choice |
| MAP-05 | `label`, `dailyPlanUzs`, `daysInMonth`, `varianceUzs`, `completionPct` are computed, never stored |
| MAP-06 | Report DTOs ↔ `v_*` views |
| **CNF-06** | `budget_lines.planned_amount_uzs NOT NULL` vs `plannedAmountUzs: null` — **semantic**, must map to row absence. Listed here because it looks like a mapping issue but is a real constraint |

### IMPLEMENTATION GAPS (architecture ready, no API/backend)

| ID | Capability | DB artifact |
|---|---|---|
| IMP-01 | Break-even | `v_break_even`, `v_break_even_center` |
| IMP-02 | Profit & loss | `v_profit_loss`, `v_profit_loss_center` |
| IMP-03 | Reconciliation | `reconciliation_runs`, `v_period_reconciliation` |
| IMP-04 | Import exception triage | `import_exceptions`, `v_open_import_exceptions` |
| IMP-05 | Period close/reopen | `period_status_events` |
| IMP-06 | Expense/revenue reversal | `expense_reversals`, `revenue_reversals` |
| IMP-07 | Audit log writes | `audit_logs` |
| IMP-08 | Dashboard annual block + granularity bucketing | service-layer composition |

### DEFERRED / OUT OF SCOPE

| ID | Item | Reason |
|---|---|---|
| DEF-01 | Multi-tenant / `organization_id` | DECISION-E: single tenant |
| DEF-02 | Viewer / Administrator roles | DECISION-D: not seeded |
| DEF-03 | Attachments (`attachments`) | No endpoint in either contract |
| DEF-04 | Report snapshots (`report_snapshots`) | No endpoint in either contract |
| DEF-05 | Server-side exports (`/exports`) | CSV generated client-side today |
| DEF-06 | Scheduled Telegram delivery | Previews only; scheduler is future work |
| **CNF-07** | Per-user Telegram `chatId` storage | No relational home; JSONB or new table — DEC-06 |
| **CNF-08** | `Branch.code` literal union in `domain.ts` | Contradicts dynamic-branch model; harmless at 2 branches |

---

## 12. Decision Register

| ID | Decision required | Blocks | Owner |
|---|---|---|---|
| **DEC-00** | **Which business source is authoritative** — workbook `1OWIABt9…` (expense-only) or `10W6K8tb…` (+ revenue/cashiers)? Or both, with a stated merge rule | BLK-01/02/03 | Product owner |
| **DEC-01** | Which API contract is authoritative — the 55-endpoint document or the 40-endpoint code? Is expense approval in V1? | BLK-01, CNF-10 | Product owner |
| **DEC-02** | Revenue grain: per payment, per day, or per period? Do budget/revenue-plan `PUT`s create revisions or update in place? | BLK-02, CNF-05 | Product owner + DB architect |
| **DEC-03** | Is monthly closing (close/reopen) in V1? | CNF-03, IMP-05 | Product owner |
| **DEC-04** | JWT transport (HTTP-only cookie vs header), TTL, refresh contract | Auth module | Backend architect |
| **DEC-05** | Excel import: keep client-side parsing, or move server-side into `import_batches`? | CNF-07 (import), IMP-04 | Backend architect |
| **DEC-06** | Telegram recipient storage: `system_settings` JSONB or a new table? | CNF-07 | Backend architect |
| **DEC-07** | Audit scope: which operations, whether denied attempts are logged, retention, `request_ip` capture | CNF-09, IMP-07 | Product owner + security |
| **DEC-08** | Salary: single column or salary-history table? Who may read it? | CNF-04 | Product owner |
| **DEC-09** | Permission seed reconciliation against the 20 enforced codes | CNF-02 | Backend architect |
| **DEC-10** | Director data-entry capability — Excel says yes, the app says no | CNF-11 | Product owner |
| **DEC-11** | Break-even: add `GET /reports/break-even` to the contract? | IMP-01 | Product owner |

---

## 13. Backend Readiness Matrix

| Domain | Database | API contract | Business rules | Auth | Implementation |
|---|---|---|---|---|---|
| Authentication | READY | READY | READY | PARTIAL (DEC-04) | **PARTIAL** |
| Users | PARTIAL (no salary) | READY | READY | READY | **PARTIAL** |
| Roles | READY | READY | READY | READY | **READY** |
| Permissions | PARTIAL (seed drift) | READY | READY | READY | **PARTIAL** |
| Organizations | OUT OF SCOPE | OUT OF SCOPE | OUT OF SCOPE | — | **OUT OF SCOPE** |
| Branches | READY | READY | READY | READY | **READY** |
| Accounting periods (read) | READY | READY | READY | READY | **READY** |
| Accounting periods (close) | READY | BLOCKED | PARTIAL | READY | **BLOCKED** |
| Expense categories / master data | READY | READY | READY | READY | **READY** |
| Expenses | READY | READY | READY | READY | **READY** |
| Revenue | **BLOCKED** | **BLOCKED** | PARTIAL | READY | **BLOCKED** |
| Budget | PARTIAL | PARTIAL | READY | READY | **PARTIAL** |
| Reports — monthly | READY | READY | READY | READY | **READY** |
| Reports — branch comparison | READY | READY | READY | READY | **READY** |
| Reports — cashiers | PARTIAL (salary) | READY | READY | READY | **PARTIAL** |
| Reports — dashboard | PARTIAL | READY | READY | READY | **PARTIAL** |
| Break-even | READY | **BLOCKED** (no endpoint) | READY (formula approved) | READY | **BLOCKED** |
| Approval | READY | BLOCKED | PARTIAL | READY | **BLOCKED** |
| Audit | READY | PARTIAL | PARTIAL | READY | **PARTIAL** |
| Import | PARTIAL | PARTIAL | READY | READY | **PARTIAL** |
| Notifications | PARTIAL | READY | READY | READY | **PARTIAL** |

**Totals — 21 domains:** READY **7** · PARTIAL **9** · BLOCKED **4** · OUT OF SCOPE **1**

---

## 14. Final Backend Source of Truth

Recorded as it stands today. Where a stack is undecided, the cell says so rather than guessing.

| Domain | Business source | Database source | API source | Final status |
|---|---|---|---|---|
| Authentication | Excel `Rollar` + DECISION-D | `001_reference_schema.sql` | `contracts.ts` | READY (DEC-04) |
| Users | Excel `Rollar` | `001_reference_schema.sql` | `contracts.ts` | PARTIAL — salary gap |
| Roles / Permissions | DECISION-D | `001_reference_schema.sql` | `contracts.ts` | PARTIAL — seed drift |
| Branches | DECISION-A | `001_reference_schema.sql` | both contracts agree | READY |
| Accounting periods | PLATFORM_TZ + Excel | `001_reference_schema.sql` | `contracts.ts` (read only) | READY (read) / BLOCKED (close) |
| Master data | Excel `Sozlamalar` | `001_reference_schema.sql` | `contracts.ts` | READY |
| Expenses | Excel `Jurnal` + kassa sheets | `001_reference_schema.sql` | `contracts.ts` | **READY** |
| Revenue | **NOT VERIFIED** — two workbooks disagree | **NOT VERIFIED** — no schema holds the implemented grain | **NOT VERIFIED** — 2 contracts | **BLOCKED** |
| Budget | Excel `Budjet_tarixi` | `001_reference_schema.sql` | `contracts.ts` | PARTIAL — revisioning (DEC-02) |
| Reports (monthly, branch) | Excel `Oylik_hisobot`, `Filiallar_taqqoslash` | `003_report_…sql` views | `contracts.ts` | READY |
| Reports (cashiers, dashboard) | PLATFORM_TZ + Excel `Xulosa` | views + salary gap | `contracts.ts` | PARTIAL |
| Break-even | **Approved business decision** (formula) | `v_break_even`, `v_break_even_center` | **MISSING in both contracts** | DATABASE READY / API GAP |
| Approval | DECISION-B (default OFF) | `001_reference_schema.sql` | conflicting | DECISION REQUIRED |
| Audit | **NOT VERIFIED** | `audit_logs` | doc contract only | DECISION REQUIRED |
| Import | Excel kassa sheets | `import_*` tables | `contracts.ts` (different shape) | PARTIAL |
| Notifications | **NOT VERIFIED** — no business source | `system_settings` only | `contracts.ts` | PARTIAL |
| Organizations / tenancy | DECISION-E | none by design | none | OUT OF SCOPE |

---

## 15. Required Actions Before Phase 18

**Must resolve (blocking):**

1. **DEC-00** — name the single authoritative business source (or the merge rule between the two workbooks).
2. **DEC-01** — name the single authoritative API contract. If the 55-endpoint document wins, the frontend needs rework; if the 40-endpoint code wins, `FRONTEND_API_CONTRACT.md` should be marked superseded.
3. **DEC-02** — fix the revenue grain, then confirm which schema file is the Prisma baseline.

**Should resolve before the affected module (non-blocking):**

4. **DEC-04** — JWT transport (blocks AuthModule only).
5. **DEC-09** — permission seed reconciliation (blocks RbacModule only).
6. **DEC-08** — salary storage (blocks Users + cashier report only).
7. **DEC-07** — audit scope (blocks AuditModule; also a HIGH security gap while unresolved).

**Housekeeping (no decision needed):**

8. Mark the losing stack's documents as SUPERSEDED once DEC-00/01 land — no document currently carries such a marker, which is the mechanical reason this audit could not self-resolve.
9. Record CNF-08 (`Branch.code` literal union) as known technical debt.

**Work that can start immediately, regardless of the above:** Foundation (NestJS skeleton, config, error filter, validation pipe, money/date value objects) and the **Expenses** domain — the only large domain with zero open decisions across all three stacks.

---

## 16. Final Verdict

The frontend and the database are each internally sound. What is missing is agreement between them about **what the product is**: an expense ledger with daily revenue totals (Stack B), or a full financial workflow platform with per-payment revenue, approvals, period closing and reconciliation (Stack A), or the minimal approved-decision middle (Stack C).

That question is not technical and is not mine to answer. Everything downstream of it — the Prisma baseline, the controller surface, six endpoints with no table, and roughly a third of the readiness matrix — waits on it.

What is *not* waiting: seven domains are fully READY, and the expense ledger in particular is unambiguous, evidence-backed and e2e-covered across every source.

---

**BACKEND IMPLEMENTATION READINESS: PARTIALLY READY**

**BLOCKER COUNT: 3** — BLK-01 (authoritative API contract), BLK-02 (authoritative schema + revenue grain), BLK-03 (authoritative business source). All three are facets of one product decision.

**PHASE 18 START CONDITION:**

- [ ] DEC-00 — authoritative business source named (workbook `1OWIABt9…` vs `10W6K8tb…`, or a merge rule)
- [ ] DEC-01 — authoritative API contract named (55-endpoint document vs 40-endpoint code); losing document marked SUPERSEDED
- [ ] DEC-02 — revenue grain fixed (per payment / per day / per period) and the Prisma baseline schema file named
- [ ] DEC-04 — JWT transport and refresh contract decided *(AuthModule only)*
- [ ] DEC-09 — permission seed reconciled against the 20 enforced codes *(RbacModule only)*

Once the first three boxes are ticked, Phase 18 may begin with **Foundation + Expenses**, which are unblocked today.

---

*Prepared under Phase 17.1 constraints: read / analyze / compare / reconcile / report. No conflict was resolved unilaterally, no business decision was made, no schema, contract, endpoint or source file was modified.*
