-- ============================================================================
-- FINCORE — 003_report_and_reconciliation_queries.sql
-- Canonical reporting/reconciliation views. These are the ONLY sanctioned
-- source of report numbers — no frontend or backend service re-derives a
-- formula independently (NFR-PERF-03).
--
-- All objects here are plain views, not materialized views. Rationale is
-- documented in docs/DATABASE_ARCHITECTURE.md section 19; the short version:
-- FINCORE's fact volume (a few branches, tens of thousands of rows/year) is
-- small enough that PostgreSQL evaluates these joins in well under the
-- NFR-PERF-01 budget (<3s) using the indexes from 001, and a materialized
-- view would introduce a staleness window that risks exactly the kind of
-- silently-wrong total the TZ (DQ-05, hard constraint 11/12) forbids.
-- ============================================================================

BEGIN;
SET search_path TO fincore, pg_temp;

-- ----------------------------------------------------------------------------
-- 0. Shared helper: NULL-safe percentage. NULL means "undefined" (zero
--    denominator) — the API/UI layer renders this as "—" or "Unplanned" per
--    context (TZ 5.6, BR-09). Never returns Infinity/NaN.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fincore.fn_safe_pct(p_numerator NUMERIC, p_denominator NUMERIC)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_denominator IS NULL OR p_denominator = 0 THEN NULL
              ELSE round(p_numerator * 100.0 / p_denominator, 2)
         END;
$$;

COMMENT ON FUNCTION fincore.fn_safe_pct IS 'Returns NULL (never Infinity/NaN/division error) when the denominator is zero or NULL. Callers label NULL as "—" or "Unplanned" depending on screen context.';

-- ============================================================================
-- 1. Base fact views (row-level, net of reversal/status)
-- ============================================================================

-- Formula 1 (Expense fact): net valid expenses at row grain.
CREATE OR REPLACE VIEW fincore.v_expense_net_rows AS
SELECT e.*
FROM fincore.expenses e
WHERE e.status = 'approved' AND NOT e.is_reversed;

COMMENT ON VIEW fincore.v_expense_net_rows IS 'Formula 1 base: every approved, non-reversed expense row. Aggregate this, do not aggregate fincore.expenses directly, or reversed/rejected rows will double count.';

-- Formula 6 (Revenue actual): net posted revenue at row grain.
CREATE OR REPLACE VIEW fincore.v_revenue_net_rows AS
SELECT rt.*
FROM fincore.revenue_transactions rt
WHERE rt.status = 'posted';

COMMENT ON VIEW fincore.v_revenue_net_rows IS 'Formula 6 base: every posted revenue transaction. Reversed transactions are excluded from every aggregate built on this view but remain visible (with status=reversed) directly in fincore.revenue_transactions for audit (FR-REV-08).';

-- ----------------------------------------------------------------------------
-- 1.1 Unified ledger (FR-LEDGER) — the full expense ledger view. Every filter
--     column FR-LEDGER-02 requires is exposed directly for WHERE-clause
--     pushdown; sort order matches FR-LEDGER-03 exactly, and the id tiebreak
--     is the immutable key so ordering is fully deterministic for keyset
--     pagination (see index & performance section 20).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW fincore.v_unified_ledger AS
SELECT
  e.id,
  e.transaction_date,
  ap.year, ap.month, ap.id AS accounting_period_id, ap.status AS period_status,
  e.branch_id, b.name AS branch_name,
  e.category_id, c.name AS category_name, e.expense_type_snapshot,
  e.department_id, d.name AS department_name,
  e.payment_method_id, pm.name AS payment_method_name,
  e.responsible_user_id, ru.full_name AS responsible_user_name,
  e.entered_by, eb.full_name AS entered_by_name,
  e.description, e.amount_uzs, e.comment,
  e.status, e.reviewed_by, e.reviewed_at, e.rejection_reason,
  e.is_reversed, e.reversed_at, e.reversed_by, e.reversal_reason,
  e.source_workbook, e.source_sheet, e.source_row, e.import_batch_id,
  e.created_at, e.updated_at,
  (e.status = 'approved' AND NOT e.is_reversed) AS is_net_eligible
FROM fincore.expenses e
JOIN fincore.accounting_periods ap ON ap.id = e.accounting_period_id
JOIN fincore.branches b            ON b.id = e.branch_id
JOIN fincore.expense_categories c  ON c.id = e.category_id
JOIN fincore.departments d         ON d.id = e.department_id
JOIN fincore.payment_methods pm    ON pm.id = e.payment_method_id
JOIN fincore.users ru              ON ru.id = e.responsible_user_id
JOIN fincore.users eb              ON eb.id = e.entered_by;

COMMENT ON VIEW fincore.v_unified_ledger IS 'FR-LEDGER-01..03. API applies WHERE filters (date range, year, month, branch/ALL, category, expense_type, department, payment_method, responsible_user, status, entered_by) and paginates ORDER BY transaction_date DESC, created_at DESC, id DESC. Category/department/payment-method NAMES here are for display convenience only — joins are always by immutable id (BR-15), so a later rename is reflected going forward without corrupting historical amount/category linkage.';

-- ----------------------------------------------------------------------------
-- 1.2 Revenue ledger (mirrors the unified expense ledger for FR-REV-14/16)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW fincore.v_revenue_ledger AS
SELECT
  rt.id, rt.receipt_no,
  ap.year, ap.month, ap.id AS accounting_period_id, ap.status AS period_status,
  rt.branch_id, b.name AS branch_name,
  rt.payment_date, rt.amount_uzs,
  rt.payment_method_id, pm.name AS payment_method_name,
  rt.collector_user_id, cu.full_name AS collector_name,
  rt.entered_by, eb.full_name AS entered_by_name,
  rt.entered_on_behalf, rt.on_behalf_reason,
  rt.external_reference, rt.description,
  rt.status, rt.reversed_at, rt.reversed_by, rt.reversal_reason,
  rt.created_at, rt.updated_at
FROM fincore.revenue_transactions rt
JOIN fincore.accounting_periods ap ON ap.id = rt.accounting_period_id
JOIN fincore.branches b            ON b.id = rt.branch_id
JOIN fincore.payment_methods pm    ON pm.id = rt.payment_method_id
JOIN fincore.users cu              ON cu.id = rt.collector_user_id
JOIN fincore.users eb              ON eb.id = rt.entered_by;

COMMENT ON VIEW fincore.v_revenue_ledger IS 'FR-REV-14/16 drill-down source: date/time, amount, channel, receipt/reference, comment, status per row, filterable by collector_user_id (never entered_by) for cashier drill-down (BR-21).';

-- ============================================================================
-- 2. Applicable plan lookups (Formulas 2 and 5)
-- ============================================================================

-- Formula 2 (Expense plan): the single applicable (is_applicable) approved
-- budget version's lines per period.
CREATE OR REPLACE VIEW fincore.v_applicable_budget_line AS
SELECT
  bv.period_id, bv.id AS budget_version_id, bv.revision_no,
  bl.branch_id, bl.category_id, bl.expense_type_snapshot, bl.planned_amount_uzs
FROM fincore.budget_versions bv
JOIN fincore.budget_lines bl ON bl.version_id = bv.id
WHERE bv.is_applicable;

COMMENT ON VIEW fincore.v_applicable_budget_line IS 'Formula 2 base. NULL/no row for a (period, branch, category) = "not planned"; a joined row with planned_amount_uzs = 0 = "deliberately planned at zero" (FR-BUD-05) — never conflate the two when aggregating (use LEFT JOIN + is-row-present, not COALESCE-to-zero alone, when a report must distinguish "no plan" from "0 plan").';

-- Formula 5 (Revenue plan): applicable approved revenue plan per (period, branch).
CREATE OR REPLACE VIEW fincore.v_applicable_revenue_plan AS
SELECT rp.period_id, rp.branch_id, rp.id AS revenue_plan_id, rp.revision_no, rp.planned_amount_uzs
FROM fincore.revenue_plans rp
WHERE rp.is_applicable;

-- Center-wide revenue plan = SUM of applicable branch plans. NEVER a stored
-- "Barchasi" row (BR-16, FR-REV-03, hard scope constraint 1).
CREATE OR REPLACE VIEW fincore.v_center_revenue_plan AS
SELECT period_id, SUM(planned_amount_uzs) AS planned_amount_uzs, COUNT(*) AS branches_with_plan
FROM fincore.v_applicable_revenue_plan
GROUP BY period_id;

-- ============================================================================
-- 3. Expense plan-vs-actual (Formulas 1-4) at (period, branch, category) grain
-- ============================================================================

CREATE OR REPLACE VIEW fincore.v_expense_plan_vs_actual AS
SELECT
  ap.id AS period_id, ap.year, ap.month,
  br.id AS branch_id, br.name AS branch_name,
  cat.id AS category_id, cat.name AS category_name, cat.expense_type,
  COALESCE(fact.actual_uzs, 0)                                    AS actual_uzs,
  plan.planned_amount_uzs,                                        -- NULL = not planned; distinct from 0
  (plan.planned_amount_uzs IS NOT NULL)                           AS has_plan,
  CASE WHEN plan.planned_amount_uzs IS NOT NULL
       THEN plan.planned_amount_uzs - COALESCE(fact.actual_uzs, 0)
       ELSE NULL END                                               AS variance_uzs, -- Formula 3
  fincore.fn_safe_pct(COALESCE(fact.actual_uzs, 0), plan.planned_amount_uzs) AS completion_pct -- Formula 4
FROM fincore.accounting_periods ap
CROSS JOIN fincore.branches br
CROSS JOIN fincore.expense_categories cat
LEFT JOIN fincore.v_applicable_budget_line plan
       ON plan.period_id = ap.id AND plan.branch_id = br.id AND plan.category_id = cat.id
LEFT JOIN (
  SELECT accounting_period_id, branch_id, category_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_expense_net_rows
  GROUP BY accounting_period_id, branch_id, category_id
) fact ON fact.accounting_period_id = ap.id AND fact.branch_id = br.id AND fact.category_id = cat.id
WHERE br.is_active AND cat.is_active;

COMMENT ON VIEW fincore.v_expense_plan_vs_actual IS 'One row per (period, branch, category) even with zero actual and no plan, so "no data" / "no plan" / "0 plan" render as distinct states per TZ 8 UX rules. Grain matches FR-REP screens 1 and 4.';

-- Monthly report (Oylik hisobot, TZ 5.6 screen 1): category x Jan-Dec for one
-- year, with fixed/variable subtotals and annual totals.
CREATE OR REPLACE VIEW fincore.v_monthly_expense_report AS
SELECT
  ap.year, br.id AS branch_id, br.name AS branch_name,
  cat.id AS category_id, cat.name AS category_name, cat.expense_type,
  ap.month,
  COALESCE(fact.actual_uzs, 0) AS actual_uzs,
  plan.planned_amount_uzs
FROM fincore.accounting_periods ap
CROSS JOIN fincore.branches br
CROSS JOIN fincore.expense_categories cat
LEFT JOIN fincore.v_applicable_budget_line plan
       ON plan.period_id = ap.id AND plan.branch_id = br.id AND plan.category_id = cat.id
LEFT JOIN (
  SELECT accounting_period_id, branch_id, category_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_expense_net_rows GROUP BY accounting_period_id, branch_id, category_id
) fact ON fact.accounting_period_id = ap.id AND fact.branch_id = br.id AND fact.category_id = cat.id
WHERE br.is_active AND cat.is_active;

COMMENT ON VIEW fincore.v_monthly_expense_report IS 'API aggregates SUM(actual_uzs)/SUM(planned_amount_uzs) across the 12 rows per (year, branch, category) for the annual columns — a query-time aggregation, never a stored formula range (FR-REP annual row, hard constraint: no formula-range dependency).';

-- Branch comparison (TZ 5.6 screen 3): per month, Sayxun vs Xalqlar vs total.
CREATE OR REPLACE VIEW fincore.v_branch_comparison AS
SELECT
  ap.id AS period_id, ap.year, ap.month,
  br.id AS branch_id, br.name AS branch_name,
  COALESCE(fact.actual_uzs, 0) AS actual_uzs,
  COALESCE(plan_sum.planned_amount_uzs, 0) AS planned_amount_uzs
FROM fincore.accounting_periods ap
CROSS JOIN fincore.branches br
LEFT JOIN (
  SELECT accounting_period_id, branch_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_expense_net_rows GROUP BY accounting_period_id, branch_id
) fact ON fact.accounting_period_id = ap.id AND fact.branch_id = br.id
LEFT JOIN (
  SELECT period_id, branch_id, SUM(planned_amount_uzs) AS planned_amount_uzs
  FROM fincore.v_applicable_budget_line GROUP BY period_id, branch_id
) plan_sum ON plan_sum.period_id = ap.id AND plan_sum.branch_id = br.id
WHERE br.is_active;

-- Two-branch single-month matrix (TZ 5.6 screen 4): category rows, Sayxun
-- Reja/Fakt/Farq, Xalqlar Reja/Fakt/Farq, jami — API pivots this per branch,
-- the view stays in tidy (one row per branch+category) form for reuse.
CREATE OR REPLACE VIEW fincore.v_two_branch_month_matrix AS
SELECT * FROM fincore.v_expense_plan_vs_actual;

COMMENT ON VIEW fincore.v_two_branch_month_matrix IS 'Same tidy grain as v_expense_plan_vs_actual; the "jami" (total) column and the overspend/unplanned status badges are computed by the API from this one filtered-to-one-period result set, not by a separate view, to avoid two sources of truth for the same numbers.';

-- ============================================================================
-- 4. Revenue plan-vs-actual, channel share, cashier report (Formulas 5-11)
-- ============================================================================

CREATE OR REPLACE VIEW fincore.v_revenue_plan_vs_actual AS
SELECT
  ap.id AS period_id, ap.year, ap.month,
  br.id AS branch_id, br.name AS branch_name,
  plan.planned_amount_uzs,
  COALESCE(fact.actual_uzs, 0) AS actual_uzs,
  GREATEST(COALESCE(plan.planned_amount_uzs, 0) - COALESCE(fact.actual_uzs, 0), 0) AS gap_uzs,       -- Formula 7
  GREATEST(COALESCE(fact.actual_uzs, 0) - COALESCE(plan.planned_amount_uzs, 0), 0) AS over_plan_uzs, -- Formula 8
  fincore.fn_safe_pct(COALESCE(fact.actual_uzs, 0), plan.planned_amount_uzs) AS collection_pct         -- Formula 9
FROM fincore.accounting_periods ap
CROSS JOIN fincore.branches br
LEFT JOIN fincore.v_applicable_revenue_plan plan ON plan.period_id = ap.id AND plan.branch_id = br.id
LEFT JOIN (
  SELECT accounting_period_id, branch_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_revenue_net_rows GROUP BY accounting_period_id, branch_id
) fact ON fact.accounting_period_id = ap.id AND fact.branch_id = br.id
WHERE br.is_active;

-- Center-wide (all-branch) revenue plan-vs-actual — SUM over branches, not a
-- stored row. Matches AC-16 shape exactly.
CREATE OR REPLACE VIEW fincore.v_revenue_plan_vs_actual_center AS
SELECT
  period_id, year, month,
  SUM(planned_amount_uzs) AS planned_amount_uzs,
  SUM(actual_uzs)         AS actual_uzs,
  GREATEST(SUM(planned_amount_uzs) - SUM(actual_uzs), 0) AS gap_uzs,
  GREATEST(SUM(actual_uzs) - SUM(planned_amount_uzs), 0) AS over_plan_uzs,
  fincore.fn_safe_pct(SUM(actual_uzs), SUM(planned_amount_uzs)) AS collection_pct
FROM (
  SELECT ap.id AS period_id, ap.year, ap.month, br.id AS branch_id,
         COALESCE(plan.planned_amount_uzs, 0) AS planned_amount_uzs,
         COALESCE(fact.actual_uzs, 0) AS actual_uzs
  FROM fincore.accounting_periods ap
  CROSS JOIN fincore.branches br
  LEFT JOIN fincore.v_applicable_revenue_plan plan ON plan.period_id = ap.id AND plan.branch_id = br.id
  LEFT JOIN (SELECT accounting_period_id, branch_id, SUM(amount_uzs) AS actual_uzs
             FROM fincore.v_revenue_net_rows GROUP BY accounting_period_id, branch_id) fact
         ON fact.accounting_period_id = ap.id AND fact.branch_id = br.id
  WHERE br.is_active
) per_branch
GROUP BY period_id, year, month;

COMMENT ON VIEW fincore.v_revenue_plan_vs_actual_center IS 'Formula 14 (branch reconciliation) is exactly: this view''s actual_uzs equals SUM(v_revenue_plan_vs_actual.actual_uzs) for the same period, by construction — both come from the same v_revenue_net_rows base, so they cannot drift.';

-- Formula 10 (Payment-channel share)
CREATE OR REPLACE VIEW fincore.v_revenue_channel_share AS
SELECT
  ap.id AS period_id, ap.year, ap.month,
  br.id AS branch_id, br.name AS branch_name,
  pm.id AS payment_method_id, pm.name AS payment_method_name,
  COALESCE(ch.channel_uzs, 0) AS channel_uzs,
  fincore.fn_safe_pct(COALESCE(ch.channel_uzs, 0), branch_total.actual_uzs) AS channel_share_pct
FROM fincore.accounting_periods ap
CROSS JOIN fincore.branches br
CROSS JOIN fincore.payment_methods pm
LEFT JOIN (
  SELECT accounting_period_id, branch_id, payment_method_id, SUM(amount_uzs) AS channel_uzs
  FROM fincore.v_revenue_net_rows GROUP BY accounting_period_id, branch_id, payment_method_id
) ch ON ch.accounting_period_id = ap.id AND ch.branch_id = br.id AND ch.payment_method_id = pm.id
LEFT JOIN (
  SELECT accounting_period_id, branch_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_revenue_net_rows GROUP BY accounting_period_id, branch_id
) branch_total ON branch_total.accounting_period_id = ap.id AND branch_total.branch_id = br.id
WHERE br.is_active AND pm.is_active;

-- Formula 11 (Cashier share) + FR-REV-13 cashier report
CREATE OR REPLACE VIEW fincore.v_cashier_report AS
SELECT
  ap.id AS period_id, ap.year, ap.month,
  br.id AS branch_id, br.name AS branch_name,
  u.id AS collector_user_id, u.full_name AS collector_name,
  COALESCE(collected.total_uzs, 0)        AS total_uzs,
  COALESCE(collected.txn_count, 0)        AS txn_count,
  fincore.fn_safe_pct(COALESCE(collected.total_uzs, 0), branch_total.actual_uzs) AS cashier_share_pct
FROM fincore.accounting_periods ap
CROSS JOIN fincore.branches br
JOIN fincore.user_roles ur ON ur.role_id = (SELECT id FROM fincore.roles WHERE code = 'cashier')
                           AND ur.is_active AND (ur.branch_id = br.id)
JOIN fincore.users u ON u.id = ur.user_id
LEFT JOIN (
  SELECT accounting_period_id, branch_id, collector_user_id,
         SUM(amount_uzs) AS total_uzs, COUNT(*) AS txn_count
  FROM fincore.v_revenue_net_rows GROUP BY accounting_period_id, branch_id, collector_user_id
) collected ON collected.accounting_period_id = ap.id AND collected.branch_id = br.id AND collected.collector_user_id = u.id
LEFT JOIN (
  SELECT accounting_period_id, branch_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_revenue_net_rows GROUP BY accounting_period_id, branch_id
) branch_total ON branch_total.accounting_period_id = ap.id AND branch_total.branch_id = br.id
WHERE br.is_active;

COMMENT ON VIEW fincore.v_cashier_report IS 'FR-REV-13/BR-21: aggregates strictly on collector_user_id via the cashier role assignment, never entered_by. A cashier with zero transactions in the month still appears with total_uzs=0 (not omitted), matching "0 vs no data" UX rule (TZ 8).';

-- Channel breakdown per cashier (drill-down support, FR-REV-13 "kanal bo'yicha summa")
CREATE OR REPLACE VIEW fincore.v_cashier_channel_breakdown AS
SELECT
  rt.accounting_period_id AS period_id, rt.branch_id, rt.collector_user_id,
  rt.payment_method_id, pm.name AS payment_method_name,
  SUM(rt.amount_uzs) AS channel_uzs, COUNT(*) AS txn_count
FROM fincore.v_revenue_net_rows rt
JOIN fincore.payment_methods pm ON pm.id = rt.payment_method_id
GROUP BY rt.accounting_period_id, rt.branch_id, rt.collector_user_id, rt.payment_method_id, pm.name;

-- ============================================================================
-- 5. Profit / loss (Formulas 12-13)
-- ============================================================================

CREATE OR REPLACE VIEW fincore.v_profit_loss AS
SELECT
  rpa.period_id, rpa.year, rpa.month, rpa.branch_id, rpa.branch_name,
  rpa.actual_uzs AS revenue_actual_uzs,
  COALESCE(exp_fact.actual_uzs, 0) AS expense_actual_uzs,
  rpa.actual_uzs - COALESCE(exp_fact.actual_uzs, 0) AS net_result_uzs,      -- Formula 12
  fincore.fn_safe_pct(rpa.actual_uzs - COALESCE(exp_fact.actual_uzs, 0), rpa.actual_uzs) AS net_margin_pct, -- Formula 13
  CASE WHEN rpa.actual_uzs - COALESCE(exp_fact.actual_uzs, 0) >= 0 THEN 'Foyda' ELSE 'Zarar' END AS result_label
FROM fincore.v_revenue_plan_vs_actual rpa
LEFT JOIN (
  SELECT accounting_period_id, branch_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_expense_net_rows GROUP BY accounting_period_id, branch_id
) exp_fact ON exp_fact.accounting_period_id = rpa.period_id AND exp_fact.branch_id = rpa.branch_id;

CREATE OR REPLACE VIEW fincore.v_profit_loss_center AS
SELECT
  rpc.period_id, rpc.year, rpc.month,
  rpc.actual_uzs AS revenue_actual_uzs,
  COALESCE(exp_fact.actual_uzs, 0) AS expense_actual_uzs,
  rpc.actual_uzs - COALESCE(exp_fact.actual_uzs, 0) AS net_result_uzs,
  fincore.fn_safe_pct(rpc.actual_uzs - COALESCE(exp_fact.actual_uzs, 0), rpc.actual_uzs) AS net_margin_pct,
  CASE WHEN rpc.actual_uzs - COALESCE(exp_fact.actual_uzs, 0) >= 0 THEN 'Foyda' ELSE 'Zarar' END AS result_label
FROM fincore.v_revenue_plan_vs_actual_center rpc
LEFT JOIN (
  SELECT accounting_period_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_expense_net_rows GROUP BY accounting_period_id
) exp_fact ON exp_fact.accounting_period_id = rpc.period_id;

COMMENT ON VIEW fincore.v_profit_loss IS 'BR-17/BR-18: net_result is revenue minus expense, never confused with collection_pct (which lives in v_revenue_plan_vs_actual). result_label is the explicit Foyda/Zarar terminology the TZ requires instead of a bare sign.';

-- ============================================================================
-- 5.1 Break-even (Formula 16) — APPROVED BUSINESS DECISION 2026-08-21. This
-- domain was Phase-3-deferred in PLATFORM_TZ_FROM_GOOGLE_SHEET.md v1.2
-- (alongside refund); the product owner explicitly reopened it into V1 scope
-- and approved the textbook formula below as final (not inferred/invented by
-- this file — see docs/DATABASE_ARCHITECTURE.md sections 3 (decision 12) and
-- 19.1 for the full sourcing trail). No new fact table: derived entirely from
-- v_expense_net_rows (fixed/variable split via expense_type_snapshot) and
-- v_revenue_net_rows — the exact same base views v_profit_loss already uses,
-- so break-even and profit/loss cannot drift from each other.
-- ============================================================================

CREATE OR REPLACE VIEW fincore.v_break_even AS
WITH exp_split AS (
  SELECT accounting_period_id, branch_id,
    SUM(amount_uzs) FILTER (WHERE expense_type_snapshot = 'fixed') AS fixed_cost_total_uzs,
    SUM(amount_uzs) FILTER (WHERE expense_type_snapshot = 'variable') AS variable_cost_total_uzs
  FROM fincore.v_expense_net_rows
  GROUP BY accounting_period_id, branch_id
),
rev AS (
  SELECT accounting_period_id, branch_id, SUM(amount_uzs) AS actual_revenue_uzs
  FROM fincore.v_revenue_net_rows
  GROUP BY accounting_period_id, branch_id
),
base AS (
  SELECT
    ap.id AS period_id, ap.year, ap.month,
    br.id AS branch_id, br.name AS branch_name,
    COALESCE(exp_split.fixed_cost_total_uzs, 0) AS fixed_cost_total_uzs,
    COALESCE(exp_split.variable_cost_total_uzs, 0) AS variable_cost_total_uzs,
    COALESCE(rev.actual_revenue_uzs, 0) AS actual_revenue_uzs
  FROM fincore.accounting_periods ap
  CROSS JOIN fincore.branches br
  LEFT JOIN exp_split ON exp_split.accounting_period_id = ap.id AND exp_split.branch_id = br.id
  LEFT JOIN rev ON rev.accounting_period_id = ap.id AND rev.branch_id = br.id
  WHERE br.is_active
),
calc AS (
  SELECT base.*,
    (actual_revenue_uzs - variable_cost_total_uzs) AS contribution_margin_uzs,
    CASE WHEN actual_revenue_uzs = 0 THEN NULL
         ELSE round((actual_revenue_uzs - variable_cost_total_uzs)::numeric / actual_revenue_uzs, 4)
    END AS contribution_margin_ratio
  FROM base
)
SELECT
  calc.*,
  CASE WHEN actual_revenue_uzs = 0 OR contribution_margin_ratio <= 0 THEN NULL
       ELSE round(fixed_cost_total_uzs::numeric / contribution_margin_ratio, 0)
  END AS break_even_point_uzs,
  CASE WHEN actual_revenue_uzs = 0 OR contribution_margin_ratio <= 0 THEN NULL
       ELSE fincore.fn_safe_pct(
         actual_revenue_uzs - round(fixed_cost_total_uzs::numeric / contribution_margin_ratio, 0),
         actual_revenue_uzs
       )
  END AS margin_of_safety_pct,
  CASE WHEN actual_revenue_uzs = 0 THEN 'NO_REVENUE'
       WHEN contribution_margin_ratio <= 0 THEN 'NON_POSITIVE_MARGIN'
       ELSE 'CALCULABLE'
  END AS break_even_status
FROM calc;

COMMENT ON VIEW fincore.v_break_even IS 'Break-even Point = Fixed Costs / Contribution Margin Ratio (= Fixed Costs / (1 - Variable Costs/Revenue)); Margin of Safety = (Revenue - Break-even Point) / Revenue. Both APPROVED BUSINESS DECISION 2026-08-21, not inferred. break_even_status is CALCULABLE / NO_REVENUE (actual_revenue_uzs = 0) / NON_POSITIVE_MARGIN (contribution_margin_ratio <= 0); break_even_point_uzs and margin_of_safety_pct are NULL whenever status is not CALCULABLE - never Infinity/NaN/division error. API/frontend must read break_even_status and render accordingly, never re-derive these conditions client-side.';

-- All-branch ("Barchasi") aggregate, same shape/purpose as v_profit_loss_center,
-- built on top of v_break_even so branch-level and center numbers cannot drift.
CREATE OR REPLACE VIEW fincore.v_break_even_center AS
WITH agg AS (
  SELECT period_id, year, month,
    SUM(fixed_cost_total_uzs) AS fixed_cost_total_uzs,
    SUM(variable_cost_total_uzs) AS variable_cost_total_uzs,
    SUM(actual_revenue_uzs) AS actual_revenue_uzs
  FROM fincore.v_break_even
  GROUP BY period_id, year, month
),
calc AS (
  SELECT agg.*,
    (actual_revenue_uzs - variable_cost_total_uzs) AS contribution_margin_uzs,
    CASE WHEN actual_revenue_uzs = 0 THEN NULL
         ELSE round((actual_revenue_uzs - variable_cost_total_uzs)::numeric / actual_revenue_uzs, 4)
    END AS contribution_margin_ratio
  FROM agg
)
SELECT
  calc.*,
  CASE WHEN actual_revenue_uzs = 0 OR contribution_margin_ratio <= 0 THEN NULL
       ELSE round(fixed_cost_total_uzs::numeric / contribution_margin_ratio, 0)
  END AS break_even_point_uzs,
  CASE WHEN actual_revenue_uzs = 0 OR contribution_margin_ratio <= 0 THEN NULL
       ELSE fincore.fn_safe_pct(
         actual_revenue_uzs - round(fixed_cost_total_uzs::numeric / contribution_margin_ratio, 0),
         actual_revenue_uzs
       )
  END AS margin_of_safety_pct,
  CASE WHEN actual_revenue_uzs = 0 THEN 'NO_REVENUE'
       WHEN contribution_margin_ratio <= 0 THEN 'NON_POSITIVE_MARGIN'
       ELSE 'CALCULABLE'
  END AS break_even_status
FROM calc;

COMMENT ON VIEW fincore.v_break_even_center IS 'Combined ("Barchasi") view across all active branches, built from v_break_even so branch-level and center numbers cannot drift - matches the v_profit_loss/v_profit_loss_center pattern (business rule: reports must support both single-branch and combined view).';

-- ============================================================================
-- 6. Data quality / reconciliation (DQ-01..DQ-09, BR-13, BR-23)
-- ============================================================================

-- Open (unresolved) import exceptions, with their would-be amount so the
-- data-quality screen can show an "unclassified/excluded" total (DQ-05).
CREATE OR REPLACE VIEW fincore.v_open_import_exceptions AS
SELECT
  ie.id AS exception_id, ie.issue_type, ie.severity, ie.status,
  ir.batch_id, ir.source_sheet, ir.source_row, ir.raw_payload, ir.target_entity,
  ie.owner_id, ie.detail, ie.created_at
FROM fincore.import_exceptions ie
JOIN fincore.import_rows ir ON ir.id = ie.import_row_id
WHERE ie.status = 'open';

COMMENT ON VIEW fincore.v_open_import_exceptions IS 'DQ-05: the amount implied by raw_payload for every open row here must be surfaced by the API as an explicit "unclassified/excluded" bucket next to any report total — never dropped silently.';

-- Reconciliation status per period: unified ledger total vs. sum of the
-- channel/cashier cuts, for both expense and revenue (Formulas 14-15, DQ-07).
CREATE OR REPLACE VIEW fincore.v_period_reconciliation AS
SELECT
  ap.id AS period_id, ap.year, ap.month,
  (SELECT COALESCE(SUM(amount_uzs), 0) FROM fincore.v_expense_net_rows WHERE accounting_period_id = ap.id) AS expense_all_branch_total,
  (SELECT COALESCE(SUM(actual_uzs), 0) FROM fincore.v_branch_comparison WHERE period_id = ap.id) AS expense_branch_sum,
  (SELECT COALESCE(SUM(amount_uzs), 0) FROM fincore.v_revenue_net_rows WHERE accounting_period_id = ap.id) AS revenue_all_branch_total,
  (SELECT COALESCE(SUM(actual_uzs), 0) FROM fincore.v_revenue_plan_vs_actual WHERE period_id = ap.id) AS revenue_branch_sum,
  (SELECT COALESCE(SUM(channel_uzs), 0) FROM fincore.v_revenue_channel_share WHERE period_id = ap.id) AS revenue_channel_sum,
  (SELECT COALESCE(SUM(total_uzs), 0) FROM fincore.v_cashier_report WHERE period_id = ap.id) AS revenue_cashier_sum,
  (SELECT COALESCE(SUM(planned_amount_uzs), 0) FROM fincore.v_center_revenue_plan WHERE period_id = ap.id) AS revenue_center_plan_total,
  (SELECT COALESCE(SUM(planned_amount_uzs), 0) FROM fincore.v_applicable_revenue_plan WHERE period_id = ap.id) AS revenue_branch_plan_sum
FROM fincore.accounting_periods ap;

COMMENT ON VIEW fincore.v_period_reconciliation IS 'All six *_total/_sum pairs are expected to be equal for a healthy period (AC-11, AC-22, DQ-07, DQ-08). 004_verification.sql asserts the differences are exactly zero for a controlled fixture. A production reconciliation job (see migration/ops doc) runs this per period and writes a reconciliation_runs row; any non-zero diff is a mismatch, never silently accepted.';

COMMIT;
