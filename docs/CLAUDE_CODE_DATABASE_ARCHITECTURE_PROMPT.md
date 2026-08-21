# Claude Code prompt — FINCORE database architecture

Paste the entire prompt below into Claude Code from the FINCORE repository root.

```text
You are the principal PostgreSQL database architect, data-integrity engineer, and security reviewer for FINCORE. Your task is to turn the approved product specification into a production-grade, implementation-ready database architecture and executable reference SQL.

## Source of truth

The authoritative specification is:

`docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md`

Read this file completely, from the first line to EOF, before designing anything. Do not rely on summaries, previous Figma screens, or assumptions from common education-center products. Trace important database decisions back to the relevant `FR-*`, `BR-*`, `DQ-*`, `AC-*`, security, migration, and Definition of Done requirements in the TZ.

Do not edit or rewrite the source TZ. If repository documentation conflicts with it, the latest `PLATFORM_TZ_FROM_GOOGLE_SHEET.md` wins. Record conflicts in the architecture document.

## Objective

Design the complete V1 database architecture for a reliable two-branch internal financial-control platform covering:

- authentication identities, users, roles, permissions, and branch scope;
- branches and master data;
- accounting periods and close/reopen history;
- expenses, correction/reversal, and unified expense ledger;
- expense-budget versions, lines, approval, revision, and locking;
- branch revenue-plan revisions and approval;
- actual revenue transactions and reversal;
- cashier attribution and cashier performance reporting;
- reporting views and exact formulas;
- Google Sheets migration staging, normalization, exception queue, and reconciliation;
- data-quality checks;
- append-only audit history;
- exports/snapshots and attachments where the TZ marks them as V1 or schema-ready extensions.

The result must be detailed enough that a backend engineer can implement migrations and APIs without inventing missing schema rules.

## Hard scope constraints

These constraints are non-negotiable:

1. Seed exactly two branches: `Sayxun` and `Xalqlar do'stligi`. The schema may support future branches, but `Barchasi` is a report filter and must never be stored as a branch.
2. The operational roles are `cashier`, `finance_manager`, and `director`. A user may hold multiple roles, and each role assignment may have branch scope; `NULL` branch scope may mean all branches only where explicitly authorized.
3. There is no student domain in this V1. Do not create students, groups, tuition, individual balances, debtor lists, attendance, CRM, LMS, refund, or student-payment tables/columns.
4. Revenue is aggregate branch revenue, not student-level revenue. A revenue transaction belongs to a branch, payment method, responsible collector/cashier, accounting period, and audit actor.
5. Expense approval is schema-ready but default OFF/auto-approved. Budget approval and revenue-plan approval are active.
6. Money is integer UZS without tiyin. Never use `float`, `real`, or binary floating point for financial values.
7. Operational timezone is `Asia/Tashkent`. Use `date` for business transaction dates where time is irrelevant and `timestamptz` for event/audit timestamps. Define timezone conversion boundaries explicitly.
8. Closed-period financial facts and approved/locked plans are not overwritten or hard-deleted.
9. Every API-facing authorization rule must be enforceable server-side. Evaluate PostgreSQL Row Level Security as defense in depth and either implement it safely or explicitly justify a different design.
10. Historical reports must remain reproducible after master-data rename or deactivation.
11. Data-quality exceptions must never silently disappear from totals.
12. All-branch totals must reconcile with branch, payment-channel, cashier, and unified-ledger totals.

## Default technology decision

Target PostgreSQL 16+ unless the repository already contains a clearly approved database technology. If you find an approved alternative, explain the conflict before using it. Do not introduce an ORM as the source of truth. SQL DDL is canonical; an ORM can later mirror it.

Prefer standard PostgreSQL features. If you use an extension, list it, justify it, and provide a fallback. Use globally unique immutable identifiers. Decide between application-generated UUIDv7 and PostgreSQL-generated UUID, document the trade-off, and keep the DDL executable on the selected PostgreSQL version.

## Required deliverables

Create or replace the following files:

1. `docs/DATABASE_ARCHITECTURE.md`
   - the authoritative architecture and data dictionary;
   - written in Uzbek Latin, with English `snake_case` identifiers;
   - must contain a complete Mermaid ERD that renders successfully.

2. `docs/database/001_reference_schema.sql`
   - executable PostgreSQL reference DDL;
   - schemas/extensions, tables, types/domains, constraints, FKs, indexes, views, functions, and integrity triggers;
   - deterministic object creation order;
   - comments on non-obvious rules.

3. `docs/database/002_seed_reference.sql`
   - two branches, the three roles, the permission catalog, and TZ-confirmed payment methods/departments/categories;
   - idempotent or explicitly reset-safe;
   - no demo financial transactions and no hardcoded acceptance-example revenue plans.

4. `docs/database/003_report_and_reconciliation_queries.sql`
   - canonical queries/views for the unified ledger, monthly expense report, budget plan-vs-actual, branch comparison, revenue plan-vs-actual, payment-channel shares, cashier report, profit/loss, data quality, and reconciliation.

5. `docs/database/004_verification.sql`
   - executable assertions or transaction-based test cases for critical constraints and formulas;
   - tests should roll back or use isolated test data.

6. `docs/DATABASE_MIGRATION_AND_OPERATIONS.md`
   - Google Sheets migration, exception handling, reconciliation, deployment order, rollback strategy, backup/restore, retention, monitoring, and operational runbooks.

Do not implement frontend or backend application code. Do not modify the approved TZ. Do not generate ORM models unless the repository already uses an ORM and the reference SQL remains canonical.

## Required architecture-document structure

`docs/DATABASE_ARCHITECTURE.md` must include all of the following sections:

1. Executive summary.
2. Scope and explicit exclusions.
3. Assumptions and decisions made from unresolved product choices.
4. Requirement-to-schema traceability matrix referencing TZ IDs.
5. Database technology and extension decisions.
6. Naming conventions and schema organization.
7. Complete Mermaid ERD.
8. Entity/table catalog.
9. Column-level data dictionary for every table.
10. Primary keys, foreign keys, unique constraints, checks, defaults, and generated values.
11. State machines and allowed transitions.
12. Authorization and branch-isolation design.
13. Period close/reopen and immutability design.
14. Correction/reversal design for expenses and revenue.
15. Budget and revenue-plan version/revision model.
16. Master-data history/snapshot strategy.
17. Audit-log and tamper-resistance strategy.
18. Import staging, exception, and reconciliation model.
19. Reporting views and formula definitions.
20. Index and query-performance strategy.
21. Transaction boundaries, locking, concurrency, and idempotency.
22. Security, privacy, backup, recovery, retention, and observability.
23. Migration/deployment order.
24. Verification and acceptance-criteria mapping.
25. Risks, trade-offs, deferred Phase 2 items, and open decisions.

For every table, document:

- purpose and owning domain;
- column name, SQL type, nullability, default, and meaning;
- PK and candidate keys;
- FK target and `ON DELETE`/`ON UPDATE` behavior;
- check/unique/exclusion constraints;
- write permissions and branch-scope behavior;
- mutable versus immutable columns;
- audit behavior;
- expected cardinality/growth;
- important indexes and the queries they support;
- retention/archival policy if applicable.

## Required domain model coverage

You may improve names or normalize further, but the architecture must cover at least these concepts:

### Identity and authorization

- users;
- roles;
- permissions;
- user role assignments with branch scope;
- optional secure session/auth metadata if the database owns it;
- user activation/blocking without destroying historical actor references.

Design exact permission codes for expense, budget, revenue, reports, period actions, import, audit, master data, and user administration. Document how a finance manager can also be a cashier for one branch without receiving unintended cashier rights in every branch.

### Core reference data

- branches;
- payment methods;
- departments;
- expense categories;
- category aliases for import normalization;
- category type fixed/variable;
- system settings/policies where justified.

Master data must use soft deactivation. Financial facts must not cascade-delete when a master record is deactivated or renamed.

### Accounting periods

- unique year/month;
- `open` and `closed` state;
- close actor, timestamp, note, optional report/export snapshot;
- controlled reopen actor, timestamp, mandatory reason;
- complete close/reopen history, not only the latest flags;
- concurrency-safe close that prevents writes racing with closure.

Explain whether closure enforcement uses constraints, triggers, stored procedures, revoked direct table writes, transaction isolation, advisory locks, or a combination. Application-only checks are not sufficient for the reference design.

### Expenses

- immutable global expense ID;
- typed transaction date and derived accounting period;
- branch, category, category-type snapshot, description, positive integer amount;
- payment method, department, responsible user, entered-by user, comment;
- source workbook/sheet/row and raw-source trace for migrated records;
- optional attachment metadata as schema-ready extension;
- status/review fields needed for configurable approval without making approval mandatory in V1;
- correction/reversal linkage and reason;
- audit trail and closed-period enforcement.

Choose and justify one safe correction/reversal model. Never erase or overwrite the original closed-period fact. Prevent reversal chains, double reversals, and ambiguous net totals. Define the canonical net-expense query.

### Expense budgets

- accounting period;
- budget version/revision;
- draft/submitted/approved/locked state;
- creator, submitter, approver, timestamps, notes;
- budget lines by version × branch × category;
- non-negative planned amount;
- explicit distinction between a zero plan and no budget line;
- category name/type snapshot needed for reproducible history;
- only one applicable approved version per period according to a documented rule;
- concurrency-safe revision creation and approval.

### Revenue plans

- one current applicable plan per period × branch, implemented through revisions;
- planned integer UZS amount;
- draft/submitted/approved/locked state;
- revision number, reason/note, actors, and timestamps;
- general total computed from approved branch plans, never stored as a disconnected `Barchasi` record;
- closed-period immutability.

### Revenue transactions and cashiers

- immutable global ID;
- branch and accounting period;
- typed payment date/time or date plus created timestamp, with a clearly documented choice;
- positive integer UZS amount;
- payment method;
- `collector_user_id` distinct from `entered_by`;
- external bank/terminal/reference identifier where available;
- short description;
- posted/reversed status;
- safe reversal with mandatory reason and actor;
- duplicate/idempotency strategy;
- exact net-revenue query.

Cashier reports must aggregate by `collector_user_id`, not `entered_by`. A revenue transaction may not be posted without branch, payment method, and collector. Define how bank/card transactions are assigned to a responsible cashier.

### Import and data quality

- import batch;
- source workbook/file metadata and immutable hash;
- staging/import rows with `raw_payload jsonb`;
- mapping/normalization result;
- import exception queue with issue type, severity, status, owner, resolution, and source-row trace;
- duplicate candidates without silent auto-delete;
- idempotent retry and partial-failure strategy;
- reconciliation runs and per-scope results;
- source count/sum versus target count/sum;
- explicit handling for typed-date normalization, category alias, unknown master data, missing values, wrong year, duplicate, branch mismatch, missing cashier/payment method, and duplicate external reference.

The known source defect must be included as a migration verification case:

- branch source total: `52 433 400` UZS;
- current unified ledger total: `46 115 000` UZS;
- missing/differing total: `6 318 400` UZS;
- Xalqlar contains text dates that were excluded by a Google Sheets `QUERY()` type inference issue.

Do not hardcode those amounts into business tables. Use them only in migration verification documentation/tests.

### Audit

- append-only audit event ID;
- actor user, effective role/scope where useful;
- action, entity type, entity ID, branch, request/correlation ID;
- before/after payload or structured diff;
- timestamp, result, reason, and safe request metadata;
- protection from normal update/delete;
- retention and privileged access strategy.

Explain what must be written by the application in the same transaction and what may be captured by database triggers. Avoid an audit implementation that silently loses the authenticated actor.

## SQL design requirements

The reference DDL must be internally consistent and runnable. It must include:

- explicit PostgreSQL schemas or a justified single-schema approach;
- extensions only when required;
- types/domains or check constraints for money and state values;
- PKs and globally unique immutable IDs;
- `created_at`, `updated_at`, and actor fields only where semantically correct;
- positive/non-negative amount checks;
- typed date/year/month checks;
- unique and partial unique indexes for applicable approved revisions;
- indexes aligned with the required report filters and sort order;
- no cascade delete from master/identity tables into financial facts;
- append-only protection for audit and immutable facts;
- closed-period write protection;
- safe state-transition functions or triggers;
- optimistic version or equivalent lost-update protection for mutable drafts;
- idempotency/external-reference protection for revenue and imports;
- comments explaining complex constraints;
- deterministic grants/RLS policies if included.

Avoid generic polymorphic FKs that cannot enforce referential integrity unless you explicitly justify the trade-off. Avoid PostgreSQL `money`. Avoid storing derived year/month when it can contradict a typed date, unless it is generated or protected by a constraint. Avoid using mutable display names as fact-table keys.

## Authorization and RLS analysis

Provide a threat-aware branch isolation design:

- cashier can create/read permitted operational rows only for the cashier's branch;
- finance manager can manage plans and reports across authorized branches while cashier rights remain separately scoped;
- director can see all branches and perform final actions;
- unauthorized `branch_id` supplied by a client must fail even if the frontend hides the selector.

If using RLS:

- show how the application sets trusted request context with `SET LOCAL` inside a transaction;
- prevent users from setting arbitrary actor/branch values through direct SQL roles;
- explain connection-pool reset requirements;
- include policies for read, insert, update, and restricted delete;
- ensure background migration/report jobs use explicit privileged roles;
- explain how tests prove no cross-branch leakage.

If not using RLS, provide an equally detailed server-side repository/query boundary and database-grant model, plus the residual risk.

## Canonical formulas and reporting

Implement and document canonical views/queries for:

1. Expense fact: net valid expenses for the selected filters.
2. Expense plan: approved applicable budget lines.
3. Expense variance: `plan − actual`.
4. Expense completion: `actual / plan × 100`; when plan is zero return a safe semantic state, never Infinity/NaN.
5. Revenue plan: sum of applicable approved branch revenue plans.
6. Revenue actual: sum of posted, non-reversed revenue transactions.
7. Revenue gap: `MAX(plan − actual, 0)`.
8. Revenue over-plan: `MAX(actual − plan, 0)`.
9. Collection percentage: `actual / plan × 100`, safe for zero plan.
10. Payment-channel share: channel actual / total actual.
11. Cashier share: collector actual / branch actual.
12. Net financial result: revenue actual − expense actual.
13. Net margin: net financial result / revenue actual × 100, safe for zero revenue.
14. Branch reconciliation: all-branch total = sum of branch totals.
15. Revenue reconciliation: all-branch total = branch totals = payment-channel totals = cashier totals.

Views must preserve drill-down keys and support the filters required by the TZ. Explain which views should remain normal views and what scale would justify materialized views or summary tables. Do not prematurely cache data at the risk of incorrect totals.

## Index and performance plan

Design indexes from actual access paths, including:

- unified ledger ordered by transaction date DESC, created time DESC, immutable ID DESC;
- period and branch filters;
- category/type, department, payment method, responsible user, status, entered-by filters;
- revenue period, branch, collector, payment method, and status filters;
- applicable approved budget/revenue-plan lookup;
- import batch/source-row and exception queues;
- audit date, actor, entity, branch, action, and correlation ID;
- unique/idempotency lookup for external references.

Discuss expected cardinality, index selectivity, write amplification, partial indexes, composite-index column order, pagination strategy, and when to use keyset versus offset pagination. The design must not have a 500/1,000-row hard limit.

## Concurrency and transaction boundaries

Document exact transaction boundaries for:

- creating/editing an expense;
- correcting/reversing an expense;
- creating/posting/reversing revenue;
- creating a new budget revision;
- submitting/approving/locking budget and revenue plans;
- closing a period;
- reopening a period;
- importing a batch;
- resolving an import exception;
- writing audit events;
- computing/storing report snapshots.

Prevent double submit/approve/reverse, lost updates, simultaneous active revisions, duplicate imports, and writes racing with period close. Use row locks, unique constraints, optimistic version columns, advisory locks, or transaction isolation deliberately and explain why.

## Migration and operations requirements

The migration/operations document must include:

- pre-migration backup and immutable source snapshot;
- staging-first import rather than direct fact inserts;
- canonical category/alias mapping;
- typed date normalization with raw values retained;
- validation and exception routing;
- preview counts/sums by sheet and branch;
- approval/commit step;
- post-import count/sum reconciliation;
- idempotent rerun and rollback strategy;
- deployment order for schemas, master data, users/RBAC, periods, plans, facts, audit, views, and policies;
- schema-versioning/migration naming convention;
- backup schedule, restore test, RPO/RTO recommendations;
- retention and archival policy;
- monitoring/alerts for failed import, authorization denial, reconciliation mismatch, close failure, audit failure, and backup failure;
- operational playbooks for period close/reopen and correcting bad transactions.

## Verification requirements

Map the SQL verification suite to `AC-01` through `AC-22` and the Definition of Done. At minimum test:

- cross-branch cashier write denial;
- invalid/text date rejection in the live API-target schema;
- category/type snapshot behavior;
- duplicate budget/revenue-plan revision prevention;
- zero plan versus no plan semantics;
- period close write blocking;
- controlled reopen with reason and audit;
- correction/reversal and double-reversal prevention;
- imported text-date normalization and the `6 318 400` UZS reconciliation case;
- more than 500 transactions without truncation;
- master rename/deactivation preserving historical reports;
- dashboard drill-down keys;
- branch revenue example: plan `160 000 000`, actual `150 000 000`, gap `10 000 000`, collection `93.75%`;
- total revenue example: plan `300 000 000`, actual `180 000 000`, gap `120 000 000`, collection `60%`;
- Naqd `60m`, Karta `50m`, Bank `40m` reconciling to `150m` with correct shares;
- Cashier A `70m` plus Cashier B `80m` reconciling to branch `150m`;
- revenue reversal removing the amount from net actual while preserving the original and audit;
- all-branch, branch, payment-channel, and cashier totals matching 100%.

Use acceptance amounts only as test fixtures. Never seed them as production data.

## Quality bar

The architecture is not complete if it contains only an ERD or a list of tables. It must be implementable, traceable, secure, concurrency-aware, migration-aware, and verifiable.

Before finishing:

1. Check every TZ entity, formula, permission, DQ rule, AC, and DoD item against the architecture.
2. Check every FK target and DDL creation order.
3. Check every referenced type, function, trigger, policy, view, and index exists.
4. Check all state transitions and partial unique indexes for race conditions.
5. Check that no student-related table, field, API assumption, or report was introduced.
6. Check that `collector_user_id` and `entered_by` are never conflated.
7. Check that `Barchasi` is not stored as a branch.
8. Check that approved/closed historical data cannot be silently overwritten.
9. Check that all SQL code fences and Mermaid syntax render correctly.
10. If a local PostgreSQL or SQL validation tool is already available, run the DDL and verification scripts in an isolated disposable database. Do not install dependencies or use network access merely for validation. If execution is unavailable, perform a strict static dependency review and say so.

Do not stop to ask broad clarification questions. Make conservative, production-safe assumptions, label them clearly, and continue. Put unresolved business decisions in an `Open decisions` section with a recommended default and impact. Do not weaken data integrity because a decision is pending.

## Final response format

When the work is finished, respond concisely with:

- files created/updated;
- selected database architecture and major decisions;
- validation performed and results;
- any genuine open decisions or risks;
- confirmation that the approved TZ was not modified;
- confirmation that no student domain was added.
```

## Optional continuation prompt for Claude Code

Use this only after reviewing the first architecture output:

```text
Now perform a second-pass database architecture audit as if you are an independent PostgreSQL reviewer. Re-read `docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md` and inspect every generated database artifact. Find contradictions, missing constraints, race conditions, broken RLS assumptions, unsafe delete behavior, incorrect reversal math, report double-counting, historical-reproducibility failures, incomplete migration traceability, weak indexes, and DDL dependency errors. Fix the artifacts directly, then provide a requirement-by-requirement audit table with Pass/Fixed/Open status. Do not add student-related scope and do not edit the source TZ.
```
