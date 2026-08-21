-- ============================================================================
-- FINCORE — 004_verification.sql
-- Executable verification suite mapped to AC-01..AC-22 and the Definition of
-- Done (docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md sections 13 and 17).
--
-- Run against an ISOLATED, DISPOSABLE database that already has 001 and 002
-- applied. This script creates its own throwaway fixtures (test users, a
-- synthetic accounting period far outside any real business month) and
-- ROLLS BACK at the very end — nothing here is meant to persist.
--
-- All acceptance amounts (160m/300m/60m/50m/40m/70m/80m/500k/6,318,400 etc.)
-- are TEST FIXTURES ONLY, per the deliverable's explicit instruction. They
-- are never written by 002_seed_reference.sql.
--
-- Must be run as a role that can `SET ROLE fincore_app` (a superuser, or a
-- role granted membership in fincore_app) so the cross-branch-denial tests
-- exercise the real RLS policies rather than a bypassing owner connection.
-- ============================================================================

BEGIN;
SET search_path TO fincore, pg_temp;

-- Local assertion helper (transaction-scoped; disappears on ROLLBACK).
CREATE FUNCTION pg_temp.assert_eq(p_actual ANYELEMENT, p_expected ANYELEMENT, p_label TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION '% FAILED: expected %, got %', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE '% PASSED (value=%)', p_label, p_actual;
END;
$$;

-- ----------------------------------------------------------------------------
-- Fixtures: branches (seeded), master data (seeded), throwaway test users,
-- and a synthetic far-future period so this suite can never collide with
-- real operational data even if accidentally run against a populated DB.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_sayxun_id UUID; v_xalqlar_id UUID;
  v_rent_id UUID; v_marketing_id UUID; v_dept_id UUID;
  v_cash_id UUID; v_card_id UUID; v_bank_id UUID;
  v_role_cashier UUID; v_role_finance UUID; v_role_director UUID;
  v_cashier_sayxun UUID; v_cashier_xalqlar UUID; v_finance_mgr UUID; v_director UUID;
  v_cashier_a UUID; v_cashier_b UUID; v_xalqlar_cashier2 UUID;
  v_system_user UUID;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_xalqlar_id FROM fincore.branches WHERE code = 'XALQLAR_DOSTLIGI';
  IF v_sayxun_id IS NULL OR v_xalqlar_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE SETUP FAILED: run 002_seed_reference.sql before this script';
  END IF;

  SELECT id INTO v_system_user FROM fincore.users WHERE is_system LIMIT 1;

  SELECT id INTO v_rent_id FROM fincore.expense_categories WHERE code = 'RENT';
  SELECT id INTO v_marketing_id FROM fincore.expense_categories WHERE code = 'MARKETING_EXPENSE';
  SELECT id INTO v_dept_id FROM fincore.departments WHERE code = 'GENERAL';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_card_id FROM fincore.payment_methods WHERE code = 'CARD';
  SELECT id INTO v_bank_id FROM fincore.payment_methods WHERE code = 'BANK_TRANSFER';

  SELECT id INTO v_role_cashier FROM fincore.roles WHERE code = 'cashier';
  SELECT id INTO v_role_finance FROM fincore.roles WHERE code = 'finance_manager';
  SELECT id INTO v_role_director FROM fincore.roles WHERE code = 'director';

  INSERT INTO fincore.users (full_name, phone, password_hash) VALUES
    ('Test Kassir Sayxun', '+998900000001', 'x') RETURNING id INTO v_cashier_sayxun;
  INSERT INTO fincore.users (full_name, phone, password_hash) VALUES
    ('Test Kassir Xalqlar', '+998900000002', 'x') RETURNING id INTO v_cashier_xalqlar;
  INSERT INTO fincore.users (full_name, phone, password_hash) VALUES
    ('Test Moliya Rahbari', '+998900000003', 'x') RETURNING id INTO v_finance_mgr;
  INSERT INTO fincore.users (full_name, phone, password_hash) VALUES
    ('Test Direktor', '+998900000004', 'x') RETURNING id INTO v_director;
  INSERT INTO fincore.users (full_name, phone, password_hash) VALUES
    ('Kassir A', '+998900000005', 'x') RETURNING id INTO v_cashier_a;
  INSERT INTO fincore.users (full_name, phone, password_hash) VALUES
    ('Kassir B', '+998900000006', 'x') RETURNING id INTO v_cashier_b;
  INSERT INTO fincore.users (full_name, phone, password_hash) VALUES
    ('Xalqlar Kassir 2', '+998900000007', 'x') RETURNING id INTO v_xalqlar_cashier2;

  INSERT INTO fincore.user_roles (user_id, role_id, branch_id, granted_by) VALUES
    (v_cashier_sayxun, v_role_cashier, v_sayxun_id, v_system_user),
    (v_cashier_xalqlar, v_role_cashier, v_xalqlar_id, v_system_user),
    (v_finance_mgr, v_role_finance, NULL, v_system_user),
    (v_finance_mgr, v_role_cashier, v_sayxun_id, v_system_user), -- combined role per TZ 4 (Madina pattern)
    (v_director, v_role_director, NULL, v_system_user),
    (v_cashier_a, v_role_cashier, v_sayxun_id, v_system_user),
    (v_cashier_b, v_role_cashier, v_sayxun_id, v_system_user),
    (v_xalqlar_cashier2, v_role_cashier, v_xalqlar_id, v_system_user);

  RAISE NOTICE 'FIXTURE SETUP PASSED';
END $$;

-- ============================================================================
-- AC-01 / AC-19: cross-branch write denial for expenses and revenue.
-- Executed as fincore_app with app.current_user_id = the Xalqlar cashier,
-- attempting to write into Sayxun. Must be denied by RLS (WITH CHECK).
-- ============================================================================

SET LOCAL ROLE fincore_app;
SELECT set_config('app.current_user_id', id::text, true) FROM fincore.users WHERE phone = '+998900000002'; -- Xalqlar cashier

DO $$
DECLARE
  v_sayxun_id UUID; v_rent_id UUID; v_dept_id UUID; v_cash_id UUID; v_xalqlar_cashier UUID;
  v_caught BOOLEAN := false;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_rent_id FROM fincore.expense_categories WHERE code = 'RENT';
  SELECT id INTO v_dept_id FROM fincore.departments WHERE code = 'GENERAL';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_xalqlar_cashier FROM fincore.users WHERE phone = '+998900000002';

  BEGIN
    INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                   payment_method_id, department_id, responsible_user_id, entered_by)
    VALUES (DATE '2031-03-05', v_sayxun_id, v_rent_id, 'AC-01 cross-branch attempt', 1000000,
            v_cash_id, v_dept_id, v_xalqlar_cashier, v_xalqlar_cashier);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'AC-01 FAILED: Xalqlar cashier was able to write a Sayxun expense';
  END IF;
  RAISE NOTICE 'AC-01 PASSED: cross-branch expense insert denied (403-equivalent RLS rejection)';
END $$;

DO $$
DECLARE
  v_sayxun_id UUID; v_cash_id UUID; v_xalqlar_cashier UUID;
  v_caught BOOLEAN := false;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_xalqlar_cashier FROM fincore.users WHERE phone = '+998900000002';

  BEGIN
    INSERT INTO fincore.revenue_transactions (branch_id, payment_date, amount_uzs, payment_method_id, collector_user_id, entered_by)
    VALUES (v_sayxun_id, DATE '2031-03-05', 500000, v_cash_id, v_xalqlar_cashier, v_xalqlar_cashier);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'AC-19 FAILED: Xalqlar cashier was able to write a Sayxun revenue transaction';
  END IF;
  RAISE NOTICE 'AC-19 PASSED: cross-branch revenue insert denied';
END $$;

RESET ROLE;
SELECT set_config('app.current_user_id', '', true);

-- ============================================================================
-- AC-02: invalid/text date rejected by the live schema's typed DATE column.
-- ============================================================================

DO $$
DECLARE
  v_sayxun_id UUID; v_rent_id UUID; v_dept_id UUID; v_cash_id UUID; v_director UUID;
  v_caught BOOLEAN := false;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_rent_id FROM fincore.expense_categories WHERE code = 'RENT';
  SELECT id INTO v_dept_id FROM fincore.departments WHERE code = 'GENERAL';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_director FROM fincore.users WHERE phone = '+998900000004';

  BEGIN
    -- Dynamic SQL forces the same runtime text->date cast an API layer would
    -- hit if it ever bound a raw Sheets-style string straight to this column.
    EXECUTE format(
      'INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs, payment_method_id, department_id, responsible_user_id, entered_by) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L)',
      '15.08.2026 garbage', v_sayxun_id, v_rent_id, 'AC-02 fixture', 100000, v_cash_id, v_dept_id, v_director, v_director
    );
  EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'AC-02 FAILED: an invalid text date was accepted where a typed DATE was expected';
  END IF;
  RAISE NOTICE 'AC-02 PASSED: invalid text date rejected by the type system at the live expenses table (DQ-01)';
END $$;

-- ============================================================================
-- AC-03 / AC-04: new category carries a type; expense snapshots it read-only.
-- ============================================================================

DO $$
DECLARE
  v_sayxun_id UUID; v_new_cat_id UUID; v_dept_id UUID; v_cash_id UUID; v_finance_mgr UUID;
  v_expense_id UUID; v_snapshot fincore.expense_type;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_dept_id FROM fincore.departments WHERE code = 'GENERAL';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_finance_mgr FROM fincore.users WHERE phone = '+998900000003';

  INSERT INTO fincore.expense_categories (code, name, expense_type)
  VALUES ('AC03_TEST_CATEGORY', 'AC-03 test category', 'variable')
  RETURNING id INTO v_new_cat_id;

  INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                 payment_method_id, department_id, responsible_user_id, entered_by)
  VALUES (DATE '2031-03-06', v_sayxun_id, v_new_cat_id, 'AC-03/04 fixture', 250000,
          v_cash_id, v_dept_id, v_finance_mgr, v_finance_mgr)
  RETURNING id INTO v_expense_id;

  SELECT expense_type_snapshot INTO v_snapshot FROM fincore.expenses WHERE id = v_expense_id;
  PERFORM pg_temp.assert_eq(v_snapshot::text, 'variable', 'AC-03/AC-04: new category appears immediately, type auto-snapshotted');
END $$;

-- ============================================================================
-- AC-05: duplicate budget line rejected by UNIQUE(version, branch, category).
-- ============================================================================

DO $$
DECLARE
  v_period_id UUID; v_version_id UUID; v_sayxun_id UUID; v_rent_id UUID; v_finance_mgr UUID;
  v_caught BOOLEAN := false;
BEGIN
  SELECT id INTO v_finance_mgr FROM fincore.users WHERE phone = '+998900000003';
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_rent_id FROM fincore.expense_categories WHERE code = 'RENT';
  v_period_id := fincore.fn_ensure_period(2031, 3);

  v_version_id := fincore.fn_create_budget_revision(v_period_id, v_finance_mgr, 'AC-05 fixture');

  INSERT INTO fincore.budget_lines (version_id, branch_id, category_id, expense_type_snapshot, planned_amount_uzs, created_by)
  VALUES (v_version_id, v_sayxun_id, v_rent_id, 'fixed', 5000000, v_finance_mgr);

  BEGIN
    INSERT INTO fincore.budget_lines (version_id, branch_id, category_id, expense_type_snapshot, planned_amount_uzs, created_by)
    VALUES (v_version_id, v_sayxun_id, v_rent_id, 'fixed', 6000000, v_finance_mgr);
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'AC-05 FAILED: a second budget line for the same (version, branch, category) was accepted';
  END IF;
  RAISE NOTICE 'AC-05 PASSED: duplicate budget line rejected (unique constraint)';
END $$;

-- ============================================================================
-- AC-06 / AC-07: variance sign and Unplanned/NULL completion.
-- ============================================================================

DO $$
DECLARE
  v_period_id UUID; v_sayxun_id UUID; v_rent_id UUID; v_marketing_id UUID; v_dept_id UUID;
  v_cash_id UUID; v_finance_mgr UUID; v_director UUID; v_version_id UUID;
  v_variance BIGINT; v_completion NUMERIC; v_unplanned_completion NUMERIC; v_unplanned_has_plan BOOLEAN;
BEGIN
  SELECT id INTO v_finance_mgr FROM fincore.users WHERE phone = '+998900000003';
  SELECT id INTO v_director FROM fincore.users WHERE phone = '+998900000004';
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_rent_id FROM fincore.expense_categories WHERE code = 'RENT';
  SELECT id INTO v_marketing_id FROM fincore.expense_categories WHERE code = 'MARKETING_EXPENSE';
  SELECT id INTO v_dept_id FROM fincore.departments WHERE code = 'GENERAL';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  v_period_id := fincore.fn_ensure_period(2031, 3);

  SELECT id INTO v_version_id FROM fincore.budget_versions WHERE period_id = v_period_id ORDER BY revision_no DESC LIMIT 1;
  PERFORM fincore.fn_submit_budget_version(v_version_id, v_finance_mgr);
  -- Per TZ 4.1: finance_manager may only submit a budget for approval;
  -- final approval is director-only (budget.approve is not in the
  -- finance_manager seed permission set).
  PERFORM fincore.fn_approve_budget_version(v_version_id, v_director);
  -- Rent plan for this period/branch is now applicable at 5,000,000.

  INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                 payment_method_id, department_id, responsible_user_id, entered_by)
  VALUES (DATE '2031-03-07', v_sayxun_id, v_rent_id, 'AC-06 overspend fixture', 7000000,
          v_cash_id, v_dept_id, v_finance_mgr, v_finance_mgr);

  -- Unplanned category: real spend, no budget line at all.
  INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                 payment_method_id, department_id, responsible_user_id, entered_by)
  VALUES (DATE '2031-03-07', v_sayxun_id, v_marketing_id, 'AC-07 unplanned fixture', 300000,
          v_cash_id, v_dept_id, v_finance_mgr, v_finance_mgr);

  SELECT variance_uzs, completion_pct INTO v_variance, v_completion
    FROM fincore.v_expense_plan_vs_actual
   WHERE period_id = v_period_id AND branch_id = v_sayxun_id AND category_id = v_rent_id;
  PERFORM pg_temp.assert_eq(v_variance, -2000000::bigint, 'AC-06: overspend variance is negative (5,000,000 - 7,000,000)');
  PERFORM pg_temp.assert_eq(v_completion > 100, true, 'AC-06: completion% exceeds 100 on overspend');

  SELECT completion_pct, has_plan INTO v_unplanned_completion, v_unplanned_has_plan
    FROM fincore.v_expense_plan_vs_actual
   WHERE period_id = v_period_id AND branch_id = v_sayxun_id AND category_id = v_marketing_id;
  PERFORM pg_temp.assert_eq(v_unplanned_has_plan, false, 'AC-07: unplanned category has_plan=false');
  PERFORM pg_temp.assert_eq(v_unplanned_completion IS NULL, true, 'AC-07: completion_pct is NULL (renders as "Unplanned"), never a division error');
END $$;

-- ============================================================================
-- AC-08 / AC-09: period close blocks writes; reopen requires a reason and is
-- audited; the write succeeds again afterward.
-- ============================================================================

DO $$
DECLARE
  v_period_id UUID; v_director UUID; v_expense_id UUID; v_caught BOOLEAN := false;
  v_events_before INT; v_events_after INT;
BEGIN
  SELECT id INTO v_director FROM fincore.users WHERE phone = '+998900000004';
  v_period_id := fincore.fn_ensure_period(2031, 4);

  SELECT id INTO v_expense_id FROM fincore.expenses WHERE accounting_period_id = v_period_id LIMIT 1;
  IF v_expense_id IS NULL THEN
    INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                   payment_method_id, department_id, responsible_user_id, entered_by)
    SELECT DATE '2031-04-01', b.id, c.id, 'AC-08 fixture', 100000, pm.id, d.id, v_director, v_director
    FROM fincore.branches b, fincore.expense_categories c, fincore.payment_methods pm, fincore.departments d
    WHERE b.code = 'SAYXUN' AND c.code = 'RENT' AND pm.code = 'CASH' AND d.code = 'GENERAL'
    RETURNING id INTO v_expense_id;
  END IF;

  PERFORM fincore.fn_close_period(v_period_id, v_director, 'AC-08/09 fixture close');

  BEGIN
    UPDATE fincore.expenses SET comment = 'attempted edit after close' WHERE id = v_expense_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'AC-08 FAILED: expense edit succeeded on a closed period';
  END IF;
  RAISE NOTICE 'AC-08 PASSED: closed-period expense edit blocked';

  -- AC-09: reopen without a reason must fail.
  v_caught := false;
  BEGIN
    PERFORM fincore.fn_reopen_period(v_period_id, v_director, NULL);
  EXCEPTION WHEN not_null_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'AC-09 FAILED: reopen succeeded without a mandatory reason';
  END IF;

  SELECT count(*) INTO v_events_before FROM fincore.period_status_events WHERE period_id = v_period_id;
  PERFORM fincore.fn_reopen_period(v_period_id, v_director, 'Xato tuzatish uchun qayta ochildi (AC-09)');
  SELECT count(*) INTO v_events_after FROM fincore.period_status_events WHERE period_id = v_period_id;
  PERFORM pg_temp.assert_eq(v_events_after, v_events_before + 1, 'AC-09: reopen recorded in period_status_events');
  PERFORM pg_temp.assert_eq(
    EXISTS (SELECT 1 FROM fincore.audit_logs WHERE entity_type = 'accounting_period' AND entity_id = v_period_id::text AND action = 'period.reopen'),
    true, 'AC-09: reopen produced an audit_logs row');

  -- The write now succeeds again.
  UPDATE fincore.expenses SET comment = 'edited after reopen' WHERE id = v_expense_id;
  RAISE NOTICE 'AC-09 PASSED: reopen required a reason, was audited, and re-enabled writes';
END $$;

-- ============================================================================
-- AC-10: text-date import normalization + the 6,318,400 UZS reconciliation
-- case (structural proof at reduced scale — the pattern, not all 43 rows).
-- ============================================================================

DO $$
DECLARE
  v_batch_id UUID; v_row_ok UUID; v_row_bad UUID; v_finance_mgr UUID;
  v_exception_count INT;
BEGIN
  SELECT id INTO v_finance_mgr FROM fincore.users WHERE phone = '+998900000003';

  INSERT INTO fincore.import_batches (source_workbook, source_file_hash, imported_by)
  VALUES ('AC-10 fixture workbook', 'ac10-fixture-hash', v_finance_mgr)
  RETURNING id INTO v_batch_id;

  -- A row whose date column is a real Date value (parses cleanly).
  INSERT INTO fincore.import_rows (batch_id, source_sheet, source_row, raw_payload, target_entity, status)
  VALUES (v_batch_id, 'Xalqlar_kassa', 2, '{"date": "2026-08-01", "amount": 22998400}'::jsonb, 'expense', 'valid')
  RETURNING id INTO v_row_ok;

  -- A row whose date is TEXT "15.08.2026" the way the source QUERY() dropped
  -- it — DQ-01/DQ-02: never let it slide silently into the fact ledger.
  INSERT INTO fincore.import_rows (batch_id, source_sheet, source_row, raw_payload, target_entity, status)
  VALUES (v_batch_id, 'Xalqlar_kassa', 3, '{"date": "15.08.2026", "amount": 6318400}'::jsonb, 'expense', 'exception')
  RETURNING id INTO v_row_bad;

  INSERT INTO fincore.import_exceptions (import_row_id, issue_type, severity, detail)
  VALUES (v_row_bad, 'invalid_date', 'error', 'Source text date "15.08.2026" excluded by legacy QUERY() type inference; routed to exception queue instead of silently dropped.');

  INSERT INTO fincore.reconciliation_runs (run_type, scope_type, scope_id, source_count, source_sum, target_count, target_sum, status, created_by)
  VALUES ('import', 'batch', v_batch_id::text, 2, 29316800, 1, 22998400, 'mismatch', v_finance_mgr);
  -- source_sum(29,316,800) - target_sum(22,998,400) = 6,318,400: the exact
  -- documented source defect, reproduced structurally at fixture scale.

  SELECT count(*) INTO v_exception_count FROM fincore.v_open_import_exceptions WHERE batch_id = v_batch_id;
  PERFORM pg_temp.assert_eq(v_exception_count, 1, 'AC-10: the text-date row is visible as an OPEN exception, not silently dropped');
  PERFORM pg_temp.assert_eq(
    (SELECT diff_sum FROM fincore.reconciliation_runs WHERE scope_id = v_batch_id::text),
    6318400::bigint, 'AC-10: reconciliation_runs exposes the exact 6,318,400 UZS gap, never hidden');
  RAISE NOTICE 'AC-10 PASSED';
END $$;

-- ============================================================================
-- AC-15 / AC-16 / AC-17 / AC-18: the composite revenue acceptance scenario.
-- One coherent period where all four numeric examples hold simultaneously:
--   Sayxun plan 160,000,000 / actual 150,000,000 -> gap 10,000,000 / 93.75%
--   Xalqlar plan 140,000,000 / actual 30,000,000
--   Center plan 300,000,000 / actual 180,000,000 -> gap 120,000,000 / 60%
--   Sayxun channel split: Naqd 60m / Karta 50m / Bank 40m = 150m (40/33.33/26.67%)
--   Sayxun cashier split: A 70m (60m cash + 10m card) / B 80m (40m card + 40m bank) = 150m
-- ============================================================================

DO $$
DECLARE
  v_period_id UUID; v_sayxun_id UUID; v_xalqlar_id UUID;
  v_cash_id UUID; v_card_id UUID; v_bank_id UUID;
  v_finance_mgr UUID; v_director UUID; v_cashier_a UUID; v_cashier_b UUID; v_xalqlar_cashier2 UUID;
  v_plan_sayxun UUID; v_plan_xalqlar UUID;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_xalqlar_id FROM fincore.branches WHERE code = 'XALQLAR_DOSTLIGI';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_card_id FROM fincore.payment_methods WHERE code = 'CARD';
  SELECT id INTO v_bank_id FROM fincore.payment_methods WHERE code = 'BANK_TRANSFER';
  SELECT id INTO v_finance_mgr FROM fincore.users WHERE phone = '+998900000003';
  SELECT id INTO v_director FROM fincore.users WHERE phone = '+998900000004';
  SELECT id INTO v_cashier_a FROM fincore.users WHERE phone = '+998900000005';
  SELECT id INTO v_cashier_b FROM fincore.users WHERE phone = '+998900000006';
  SELECT id INTO v_xalqlar_cashier2 FROM fincore.users WHERE phone = '+998900000007';

  v_period_id := fincore.fn_ensure_period(2031, 5);

  v_plan_sayxun := fincore.fn_create_revenue_plan_revision(v_period_id, v_sayxun_id, 160000000, v_finance_mgr, 'AC-15 fixture');
  PERFORM fincore.fn_submit_revenue_plan(v_plan_sayxun, v_finance_mgr);
  PERFORM fincore.fn_approve_revenue_plan(v_plan_sayxun, v_director);

  v_plan_xalqlar := fincore.fn_create_revenue_plan_revision(v_period_id, v_xalqlar_id, 140000000, v_finance_mgr, 'AC-16 fixture');
  PERFORM fincore.fn_submit_revenue_plan(v_plan_xalqlar, v_finance_mgr);
  PERFORM fincore.fn_approve_revenue_plan(v_plan_xalqlar, v_director);

  INSERT INTO fincore.revenue_transactions (branch_id, payment_date, amount_uzs, payment_method_id, collector_user_id, entered_by) VALUES
    (v_sayxun_id, DATE '2031-05-10', 60000000, v_cash_id, v_cashier_a, v_cashier_a),
    (v_sayxun_id, DATE '2031-05-10', 10000000, v_card_id, v_cashier_a, v_cashier_a),
    (v_sayxun_id, DATE '2031-05-11', 40000000, v_card_id, v_cashier_b, v_cashier_b),
    (v_sayxun_id, DATE '2031-05-11', 40000000, v_bank_id, v_cashier_b, v_cashier_b),
    (v_xalqlar_id, DATE '2031-05-12', 30000000, v_cash_id, v_xalqlar_cashier2, v_xalqlar_cashier2);

  -- AC-15
  PERFORM pg_temp.assert_eq((SELECT actual_uzs FROM fincore.v_revenue_plan_vs_actual WHERE period_id = v_period_id AND branch_id = v_sayxun_id), 150000000::bigint, 'AC-15: Sayxun actual = 150,000,000');
  PERFORM pg_temp.assert_eq((SELECT gap_uzs FROM fincore.v_revenue_plan_vs_actual WHERE period_id = v_period_id AND branch_id = v_sayxun_id), 10000000::bigint, 'AC-15: Sayxun gap = 10,000,000');
  PERFORM pg_temp.assert_eq((SELECT collection_pct FROM fincore.v_revenue_plan_vs_actual WHERE period_id = v_period_id AND branch_id = v_sayxun_id), 93.75::numeric, 'AC-15: Sayxun collection = 93.75%');

  -- AC-16 (center-wide; 180m is explicitly NOT labeled net profit anywhere in this schema/view set)
  PERFORM pg_temp.assert_eq((SELECT planned_amount_uzs FROM fincore.v_revenue_plan_vs_actual_center WHERE period_id = v_period_id), 300000000::bigint, 'AC-16: center plan = 300,000,000');
  PERFORM pg_temp.assert_eq((SELECT actual_uzs FROM fincore.v_revenue_plan_vs_actual_center WHERE period_id = v_period_id), 180000000::bigint, 'AC-16: center actual = 180,000,000');
  PERFORM pg_temp.assert_eq((SELECT gap_uzs FROM fincore.v_revenue_plan_vs_actual_center WHERE period_id = v_period_id), 120000000::bigint, 'AC-16: center gap = 120,000,000');
  PERFORM pg_temp.assert_eq((SELECT collection_pct FROM fincore.v_revenue_plan_vs_actual_center WHERE period_id = v_period_id), 60.00::numeric, 'AC-16: center collection = 60%');

  -- AC-17
  PERFORM pg_temp.assert_eq((SELECT channel_uzs FROM fincore.v_revenue_channel_share WHERE period_id = v_period_id AND branch_id = v_sayxun_id AND payment_method_id = v_cash_id), 60000000::bigint, 'AC-17: Naqd = 60,000,000');
  PERFORM pg_temp.assert_eq((SELECT channel_share_pct FROM fincore.v_revenue_channel_share WHERE period_id = v_period_id AND branch_id = v_sayxun_id AND payment_method_id = v_cash_id), 40.00::numeric, 'AC-17: Naqd share = 40%');
  PERFORM pg_temp.assert_eq((SELECT channel_share_pct FROM fincore.v_revenue_channel_share WHERE period_id = v_period_id AND branch_id = v_sayxun_id AND payment_method_id = v_card_id), 33.33::numeric, 'AC-17: Karta share = 33.33%');
  PERFORM pg_temp.assert_eq((SELECT channel_share_pct FROM fincore.v_revenue_channel_share WHERE period_id = v_period_id AND branch_id = v_sayxun_id AND payment_method_id = v_bank_id), 26.67::numeric, 'AC-17: Bank share = 26.67%');

  -- AC-18
  PERFORM pg_temp.assert_eq((SELECT total_uzs FROM fincore.v_cashier_report WHERE period_id = v_period_id AND branch_id = v_sayxun_id AND collector_user_id = v_cashier_a), 70000000::bigint, 'AC-18: Kassir A = 70,000,000');
  PERFORM pg_temp.assert_eq((SELECT total_uzs FROM fincore.v_cashier_report WHERE period_id = v_period_id AND branch_id = v_sayxun_id AND collector_user_id = v_cashier_b), 80000000::bigint, 'AC-18: Kassir B = 80,000,000');
  PERFORM pg_temp.assert_eq(
    (SELECT SUM(total_uzs) FROM fincore.v_cashier_report WHERE period_id = v_period_id AND branch_id = v_sayxun_id),
    150000000::bigint, 'AC-18: cashier totals sum to branch total (150,000,000)');
  -- Drill-down: cashier A's rows are independently retrievable from the ledger.
  PERFORM pg_temp.assert_eq(
    (SELECT count(*) FROM fincore.v_revenue_ledger WHERE collector_user_id = v_cashier_a AND branch_id = v_sayxun_id),
    2, 'AC-18: cashier A drill-down returns exactly her 2 transactions');

  RAISE NOTICE 'AC-15/16/17/18 PASSED';
END $$;

-- ============================================================================
-- AC-20: PATCHing an approved revenue plan is blocked.
-- ============================================================================

DO $$
DECLARE v_plan_id UUID; v_caught BOOLEAN := false;
BEGIN
  SELECT rp.id INTO v_plan_id
  FROM fincore.revenue_plans rp JOIN fincore.branches b ON b.id = rp.branch_id
  WHERE b.code = 'SAYXUN' AND rp.is_applicable
  ORDER BY rp.created_at DESC LIMIT 1;

  BEGIN
    UPDATE fincore.revenue_plans SET planned_amount_uzs = 999999999 WHERE id = v_plan_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'AC-20 FAILED: an approved revenue plan accepted an ordinary PATCH';
  END IF;
  RAISE NOTICE 'AC-20 PASSED: approved revenue plan rejects ordinary PATCH (overwrite blocked)';
END $$;

-- ============================================================================
-- AC-21: reversal of a 500,000 UZS posted revenue transaction.
-- ============================================================================

DO $$
DECLARE
  v_period_id UUID; v_sayxun_id UUID; v_cash_id UUID; v_finance_mgr UUID; v_director UUID; v_txn_id UUID;
  v_before_total BIGINT; v_after_total BIGINT; v_double_caught BOOLEAN := false;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_finance_mgr FROM fincore.users WHERE phone = '+998900000003';
  SELECT id INTO v_director FROM fincore.users WHERE phone = '+998900000004';
  v_period_id := fincore.fn_ensure_period(2031, 5);

  SELECT COALESCE(SUM(amount_uzs), 0) INTO v_before_total FROM fincore.v_revenue_net_rows WHERE accounting_period_id = v_period_id AND branch_id = v_sayxun_id;

  INSERT INTO fincore.revenue_transactions (branch_id, payment_date, amount_uzs, payment_method_id, collector_user_id, entered_by, description)
  VALUES (v_sayxun_id, DATE '2031-05-15', 500000, v_cash_id, v_finance_mgr, v_finance_mgr, 'AC-21 mis-entered amount')
  RETURNING id INTO v_txn_id;

  -- Per TZ 4.1, revenue.reverse is director-only in the V1 seed (finance_manager
  -- is deliberately not granted it — see 002_seed_reference.sql section 5).
  PERFORM fincore.fn_reverse_revenue_transaction(v_txn_id, v_director, 'Xato summa kiritilgan (AC-21)');

  SELECT COALESCE(SUM(amount_uzs), 0) INTO v_after_total FROM fincore.v_revenue_net_rows WHERE accounting_period_id = v_period_id AND branch_id = v_sayxun_id;
  PERFORM pg_temp.assert_eq(v_after_total, v_before_total, 'AC-21: net actual unchanged after reversal (500,000 excluded)');
  PERFORM pg_temp.assert_eq(
    (SELECT amount_uzs FROM fincore.revenue_transactions WHERE id = v_txn_id), 500000::bigint,
    'AC-21: original row preserved with its original amount');
  PERFORM pg_temp.assert_eq(
    EXISTS (SELECT 1 FROM fincore.revenue_reversals WHERE original_transaction_id = v_txn_id), true,
    'AC-21: reversal audit row exists');

  BEGIN
    PERFORM fincore.fn_reverse_revenue_transaction(v_txn_id, v_director, 'double reversal attempt');
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_double_caught := true;
  END;
  IF NOT v_double_caught THEN
    RAISE EXCEPTION 'AC-21 FAILED: double reversal of the same transaction was allowed';
  END IF;
  RAISE NOTICE 'AC-21 PASSED: reversal correct, original preserved, double reversal blocked';
END $$;

-- ============================================================================
-- AC-22: all-branch / branch / channel / cashier revenue totals reconcile
-- to 100% for the composite period built above.
-- ============================================================================

DO $$
DECLARE v_period_id UUID; v_rec RECORD;
BEGIN
  v_period_id := fincore.fn_ensure_period(2031, 5);
  SELECT * INTO v_rec FROM fincore.v_period_reconciliation WHERE period_id = v_period_id;

  PERFORM pg_temp.assert_eq(v_rec.revenue_all_branch_total, v_rec.revenue_branch_sum, 'AC-22: all-branch total = branch sum');
  PERFORM pg_temp.assert_eq(v_rec.revenue_all_branch_total, v_rec.revenue_channel_sum, 'AC-22: all-branch total = channel sum');
  PERFORM pg_temp.assert_eq(v_rec.revenue_all_branch_total, v_rec.revenue_cashier_sum, 'AC-22: all-branch total = cashier sum (Sayxun+Xalqlar cashiers)');
  RAISE NOTICE 'AC-22 PASSED: all-branch = branch = channel = cashier totals reconcile exactly';
END $$;

-- ============================================================================
-- AC-11: unified ledger total matches the branch-comparison report total for
-- the same filter.
-- ============================================================================

DO $$
DECLARE v_period_id UUID; v_sayxun_id UUID; v_ledger_sum BIGINT; v_report_sum BIGINT;
BEGIN
  v_period_id := fincore.fn_ensure_period(2031, 3);
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';

  SELECT COALESCE(SUM(amount_uzs), 0) INTO v_ledger_sum
    FROM fincore.v_unified_ledger WHERE accounting_period_id = v_period_id AND branch_id = v_sayxun_id AND is_net_eligible;
  SELECT actual_uzs INTO v_report_sum FROM fincore.v_branch_comparison WHERE period_id = v_period_id AND branch_id = v_sayxun_id;

  PERFORM pg_temp.assert_eq(v_ledger_sum, v_report_sum, 'AC-11: ledger sum equals branch-comparison report sum under the same filter');
END $$;

-- ============================================================================
-- AC-12: more than 500 transactions — no hardcoded truncation.
-- ============================================================================

DO $$
DECLARE
  v_period_id UUID; v_sayxun_id UUID; v_rent_id UUID; v_dept_id UUID; v_cash_id UUID; v_director UUID;
  v_count INT;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_rent_id FROM fincore.expense_categories WHERE code = 'RENT';
  SELECT id INTO v_dept_id FROM fincore.departments WHERE code = 'GENERAL';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_director FROM fincore.users WHERE phone = '+998900000004';
  v_period_id := fincore.fn_ensure_period(2031, 6);

  INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                 payment_method_id, department_id, responsible_user_id, entered_by)
  SELECT DATE '2031-06-01' + (n % 28), v_sayxun_id, v_rent_id, 'AC-12 bulk row ' || n, 1000 + n,
         v_cash_id, v_dept_id, v_director, v_director
  FROM generate_series(1, 600) AS n;

  SELECT count(*) INTO v_count FROM fincore.v_unified_ledger WHERE accounting_period_id = v_period_id AND branch_id = v_sayxun_id;
  PERFORM pg_temp.assert_eq(v_count >= 600, true, 'AC-12: 600 rows all present in the ledger view, no 500/1000-row truncation');
END $$;

-- ============================================================================
-- AC-13: category rename preserves the historical expense_type_snapshot on
-- already-posted rows; changing the category's live type does not alter
-- history either.
-- ============================================================================

DO $$
DECLARE
  v_cat_id UUID; v_expense_id UUID; v_snapshot_before fincore.expense_type; v_snapshot_after fincore.expense_type;
  v_sayxun_id UUID; v_dept_id UUID; v_cash_id UUID; v_director UUID;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_dept_id FROM fincore.departments WHERE code = 'GENERAL';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_director FROM fincore.users WHERE phone = '+998900000004';

  INSERT INTO fincore.expense_categories (code, name, expense_type) VALUES ('AC13_TEST_CATEGORY', 'AC-13 original name', 'fixed')
  RETURNING id INTO v_cat_id;

  INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                 payment_method_id, department_id, responsible_user_id, entered_by)
  VALUES (DATE '2031-03-08', v_sayxun_id, v_cat_id, 'AC-13 fixture', 400000, v_cash_id, v_dept_id, v_director, v_director)
  RETURNING id INTO v_expense_id;

  SELECT expense_type_snapshot INTO v_snapshot_before FROM fincore.expenses WHERE id = v_expense_id;

  UPDATE fincore.expense_categories SET name = 'AC-13 renamed', expense_type = 'variable' WHERE id = v_cat_id;

  SELECT expense_type_snapshot INTO v_snapshot_after FROM fincore.expenses WHERE id = v_expense_id;
  PERFORM pg_temp.assert_eq(v_snapshot_before::text, v_snapshot_after::text, 'AC-13: historical expense_type_snapshot untouched by a later category rename/retype');
  PERFORM pg_temp.assert_eq(
    (SELECT category_name FROM fincore.v_unified_ledger WHERE id = v_expense_id), 'AC-13 renamed',
    'AC-13: display name follows the live category (label-only), FK linkage intact');
END $$;

-- ============================================================================
-- Break-even verification (v_break_even / v_break_even_center) — APPROVED
-- BUSINESS DECISION 2026-08-21 (docs/DATABASE_ARCHITECTURE.md sec 3 item 12,
-- sec 19.1). Covers: formula sanity (CALCULABLE), zero-revenue safety,
-- non-positive-margin safety, zero-activity row presence, and center/branch
-- aggregation consistency. Uses periods 2031-09/10/11, previously unused by
-- any other block in this file (2031-03..06 are already claimed above).
--
-- NOTE: revenue_transactions is inserted here via its real schema column
-- payment_at (TIMESTAMPTZ), per 001_reference_schema.sql. This deliberately
-- does NOT copy the `payment_date` column name used by the AC-01/AC-15-18/
-- AC-21 fixtures above (and by v_revenue_ledger in 003) — that column does
-- not exist on fincore.revenue_transactions. See the accompanying
-- verification report (finding CRITICAL-1) for that pre-existing, unrelated
-- defect, which this block does not attempt to fix.
-- ============================================================================

DO $$
DECLARE
  v_sayxun_id UUID; v_xalqlar_id UUID;
  v_rent_id UUID; v_marketing_id UUID; v_dept_id UUID; v_cash_id UUID;
  v_director UUID; v_cashier_sayxun UUID;
  v_period_a UUID; v_period_b UUID; v_period_c UUID;
BEGIN
  SELECT id INTO v_sayxun_id FROM fincore.branches WHERE code = 'SAYXUN';
  SELECT id INTO v_xalqlar_id FROM fincore.branches WHERE code = 'XALQLAR_DOSTLIGI';
  SELECT id INTO v_rent_id FROM fincore.expense_categories WHERE code = 'RENT';
  SELECT id INTO v_marketing_id FROM fincore.expense_categories WHERE code = 'MARKETING_EXPENSE';
  SELECT id INTO v_dept_id FROM fincore.departments WHERE code = 'GENERAL';
  SELECT id INTO v_cash_id FROM fincore.payment_methods WHERE code = 'CASH';
  SELECT id INTO v_director FROM fincore.users WHERE phone = '+998900000004';
  SELECT id INTO v_cashier_sayxun FROM fincore.users WHERE phone = '+998900000001';

  v_period_a := fincore.fn_ensure_period(2031, 9);
  v_period_b := fincore.fn_ensure_period(2031, 10);
  v_period_c := fincore.fn_ensure_period(2031, 11);

  -- Period A / Sayxun: CALCULABLE (Fixed 30m, Variable 40m, Revenue 100m -> CMR 0.6, BEP 50m, MoS 50%).
  INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                 payment_method_id, department_id, responsible_user_id, entered_by)
  VALUES
    (DATE '2031-09-05', v_sayxun_id, v_rent_id, 'Break-even fixture: Sayxun fixed', 30000000, v_cash_id, v_dept_id, v_director, v_director),
    (DATE '2031-09-05', v_sayxun_id, v_marketing_id, 'Break-even fixture: Sayxun variable', 40000000, v_cash_id, v_dept_id, v_director, v_director);

  INSERT INTO fincore.revenue_transactions (branch_id, payment_at, amount_uzs, payment_method_id, collector_user_id, entered_by)
  VALUES (v_sayxun_id, TIMESTAMPTZ '2031-09-05 10:00:00+05', 100000000, v_cash_id, v_cashier_sayxun, v_cashier_sayxun);

  -- Period A / Xalqlar: NO_REVENUE (Fixed 5m, Variable 2m, no revenue row at all).
  INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                 payment_method_id, department_id, responsible_user_id, entered_by)
  VALUES
    (DATE '2031-09-06', v_xalqlar_id, v_rent_id, 'Break-even fixture: Xalqlar fixed', 5000000, v_cash_id, v_dept_id, v_director, v_director),
    (DATE '2031-09-06', v_xalqlar_id, v_marketing_id, 'Break-even fixture: Xalqlar variable', 2000000, v_cash_id, v_dept_id, v_director, v_director);

  -- Period B / Sayxun: NON_POSITIVE_MARGIN (Fixed 10m, Variable 80m, Revenue 50m -> CMR -0.6).
  INSERT INTO fincore.expenses (transaction_date, branch_id, category_id, description, amount_uzs,
                                 payment_method_id, department_id, responsible_user_id, entered_by)
  VALUES
    (DATE '2031-10-05', v_sayxun_id, v_rent_id, 'Break-even fixture: non-positive margin fixed', 10000000, v_cash_id, v_dept_id, v_director, v_director),
    (DATE '2031-10-05', v_sayxun_id, v_marketing_id, 'Break-even fixture: non-positive margin variable', 80000000, v_cash_id, v_dept_id, v_director, v_director);

  INSERT INTO fincore.revenue_transactions (branch_id, payment_at, amount_uzs, payment_method_id, collector_user_id, entered_by)
  VALUES (v_sayxun_id, TIMESTAMPTZ '2031-10-05 10:00:00+05', 50000000, v_cash_id, v_cashier_sayxun, v_cashier_sayxun);

  -- Period C: no expenses, no revenue at all in either branch (zero-activity check).

  -- ---- Formula sanity: CALCULABLE (Sayxun, Period A) ----
  PERFORM pg_temp.assert_eq((SELECT fixed_cost_total_uzs FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_sayxun_id), 30000000::bigint, 'BE-01: Sayxun fixed cost = 30,000,000');
  PERFORM pg_temp.assert_eq((SELECT variable_cost_total_uzs FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_sayxun_id), 40000000::bigint, 'BE-02: Sayxun variable cost = 40,000,000');
  PERFORM pg_temp.assert_eq((SELECT actual_revenue_uzs FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_sayxun_id), 100000000::bigint, 'BE-03: Sayxun revenue = 100,000,000');
  PERFORM pg_temp.assert_eq((SELECT contribution_margin_uzs FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_sayxun_id), 60000000::bigint, 'BE-04: Sayxun contribution margin = 60,000,000');
  PERFORM pg_temp.assert_eq((SELECT contribution_margin_ratio FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_sayxun_id), 0.6000::numeric, 'BE-05: Sayxun contribution margin ratio = 0.6000');
  PERFORM pg_temp.assert_eq((SELECT break_even_point_uzs FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_sayxun_id), 50000000::numeric, 'BE-06: Sayxun break-even point = 50,000,000');
  PERFORM pg_temp.assert_eq((SELECT margin_of_safety_pct FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_sayxun_id), 50.00::numeric, 'BE-07: Sayxun margin of safety = 50.00%');
  PERFORM pg_temp.assert_eq((SELECT break_even_status FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_sayxun_id), 'CALCULABLE', 'BE-08: Sayxun status = CALCULABLE');

  -- ---- Zero-revenue safety (Xalqlar, Period A) ----
  PERFORM pg_temp.assert_eq((SELECT actual_revenue_uzs FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_xalqlar_id), 0::bigint, 'BE-09: Xalqlar revenue = 0');
  PERFORM pg_temp.assert_eq((SELECT break_even_point_uzs FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_xalqlar_id) IS NULL, true, 'BE-10: Xalqlar break-even point is NULL (no Infinity/NaN) when revenue = 0');
  PERFORM pg_temp.assert_eq((SELECT margin_of_safety_pct FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_xalqlar_id) IS NULL, true, 'BE-11: Xalqlar margin of safety is NULL when revenue = 0');
  PERFORM pg_temp.assert_eq((SELECT break_even_status FROM fincore.v_break_even WHERE period_id = v_period_a AND branch_id = v_xalqlar_id), 'NO_REVENUE', 'BE-12: Xalqlar status = NO_REVENUE');

  -- ---- Non-positive contribution margin safety (Sayxun, Period B) ----
  PERFORM pg_temp.assert_eq((SELECT actual_revenue_uzs FROM fincore.v_break_even WHERE period_id = v_period_b AND branch_id = v_sayxun_id), 50000000::bigint, 'BE-13: Period B Sayxun revenue = 50,000,000 (not zero)');
  PERFORM pg_temp.assert_eq((SELECT contribution_margin_ratio FROM fincore.v_break_even WHERE period_id = v_period_b AND branch_id = v_sayxun_id), (-0.6000)::numeric, 'BE-14: Period B contribution margin ratio = -0.6000');
  PERFORM pg_temp.assert_eq((SELECT break_even_point_uzs FROM fincore.v_break_even WHERE period_id = v_period_b AND branch_id = v_sayxun_id) IS NULL, true, 'BE-15: break-even point is NULL when contribution margin ratio <= 0');
  PERFORM pg_temp.assert_eq((SELECT break_even_status FROM fincore.v_break_even WHERE period_id = v_period_b AND branch_id = v_sayxun_id), 'NON_POSITIVE_MARGIN', 'BE-16: status = NON_POSITIVE_MARGIN');

  -- ---- Zero-activity row presence (Period C, both branches - never silently omitted) ----
  PERFORM pg_temp.assert_eq((SELECT count(*) FROM fincore.v_break_even WHERE period_id = v_period_c), 2::bigint, 'BE-17: both branches present in Period C despite zero activity (no silent omission)');
  PERFORM pg_temp.assert_eq((SELECT break_even_status FROM fincore.v_break_even WHERE period_id = v_period_c AND branch_id = v_sayxun_id), 'NO_REVENUE', 'BE-18: Period C Sayxun status = NO_REVENUE with zero activity');

  -- ---- Center ("Barchasi") aggregation consistency, Period A ----
  PERFORM pg_temp.assert_eq(
    (SELECT fixed_cost_total_uzs FROM fincore.v_break_even_center WHERE period_id = v_period_a),
    (SELECT SUM(fixed_cost_total_uzs) FROM fincore.v_break_even WHERE period_id = v_period_a),
    'BE-19: center fixed cost = SUM(branch fixed cost)');
  PERFORM pg_temp.assert_eq(
    (SELECT variable_cost_total_uzs FROM fincore.v_break_even_center WHERE period_id = v_period_a),
    (SELECT SUM(variable_cost_total_uzs) FROM fincore.v_break_even WHERE period_id = v_period_a),
    'BE-20: center variable cost = SUM(branch variable cost)');
  PERFORM pg_temp.assert_eq(
    (SELECT actual_revenue_uzs FROM fincore.v_break_even_center WHERE period_id = v_period_a),
    (SELECT SUM(actual_revenue_uzs) FROM fincore.v_break_even WHERE period_id = v_period_a),
    'BE-21: center revenue = SUM(branch revenue)');
  PERFORM pg_temp.assert_eq(
    (SELECT contribution_margin_uzs FROM fincore.v_break_even_center WHERE period_id = v_period_a),
    (SELECT SUM(contribution_margin_uzs) FROM fincore.v_break_even WHERE period_id = v_period_a),
    'BE-22: center contribution margin = SUM(branch contribution margin) - break-even cannot drift from its own branch rows');
  PERFORM pg_temp.assert_eq((SELECT break_even_status FROM fincore.v_break_even_center WHERE period_id = v_period_a), 'CALCULABLE', 'BE-23: center status = CALCULABLE for Period A');

  RAISE NOTICE 'BREAK-EVEN VERIFICATION PASSED (BE-01..BE-23)';
END $$;

-- ============================================================================
-- Cleanup: nothing persists. This is a verification script, not a seed.
-- ============================================================================

ROLLBACK;
