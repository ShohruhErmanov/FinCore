-- ============================================================================
-- FINCORE — 009_user_account_identity_split.sql
--
-- PHASE 36: separate the deletable authentication account (users) from the
-- durable, non-authenticating identity used by financial/audit history.
--
-- Safety invariants:
--   * no financial, audit, import or report row is deleted or rewritten;
--   * every existing historical actor UUID remains unchanged;
--   * only user_roles.user_id is disposable and cascades with the account;
--   * the reserved is_system account remains the fincore_service audit anchor;
--   * no phone, email or password hash is copied into user_identities.
--
-- Forward-only and idempotent after 001 -> 008.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fincore.user_identities (
  id           UUID PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fincore.user_identities IS
  'Non-authenticating identity anchor retained after a users account is hard-deleted. Contains only immutable attribution data needed by financial/audit history; never phone, email or password_hash.';

REVOKE ALL ON TABLE fincore.user_identities FROM PUBLIC;

INSERT INTO fincore.user_identities (id, display_name, deleted_at)
SELECT id, full_name, NULL
FROM fincore.users
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    deleted_at = NULL,
    updated_at = now();

CREATE OR REPLACE FUNCTION fincore.trg_users_sync_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, fincore
AS $$
BEGIN
  INSERT INTO fincore.user_identities (id, display_name, deleted_at)
  VALUES (NEW.id, NEW.full_name, NULL)
  ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      deleted_at = NULL,
      updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fincore.trg_users_mark_identity_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, fincore
AS $$
BEGIN
  UPDATE fincore.user_identities
  SET deleted_at = COALESCE(deleted_at, now()),
      updated_at = now()
  WHERE id = OLD.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user identity % is missing', OLD.id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION fincore.trg_user_identities_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, fincore
AS $$
BEGIN
  RAISE EXCEPTION 'user identity % is immutable', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_users_sync_identity ON fincore.users;
CREATE TRIGGER trg_users_sync_identity
BEFORE INSERT OR UPDATE OF full_name ON fincore.users
FOR EACH ROW EXECUTE FUNCTION fincore.trg_users_sync_identity();

DROP TRIGGER IF EXISTS trg_users_mark_identity_deleted ON fincore.users;
CREATE TRIGGER trg_users_mark_identity_deleted
AFTER DELETE ON fincore.users
FOR EACH ROW EXECUTE FUNCTION fincore.trg_users_mark_identity_deleted();

DROP TRIGGER IF EXISTS trg_user_identities_immutable ON fincore.user_identities;
CREATE TRIGGER trg_user_identities_immutable
BEFORE DELETE ON fincore.user_identities
FOR EACH ROW EXECUTE FUNCTION fincore.trg_user_identities_immutable();

-- All listed constraints carry historical attribution. Repointing the FK does
-- not update a single business row: its UUID now resolves to the durable
-- identity rather than the deletable account.
DO $$
DECLARE
  v_fk RECORD;
  v_target OID;
BEGIN
  FOR v_fk IN
    SELECT *
    FROM (VALUES
      ('accounting_periods',    'closed_by',            'accounting_periods_closed_by_fkey'),
      ('accounting_periods',    'reopened_by',          'accounting_periods_reopened_by_fkey'),
      ('attachments',           'uploaded_by',          'attachments_uploaded_by_fkey'),
      ('audit_logs',            'actor_user_id',        'audit_logs_actor_user_id_fkey'),
      ('budget_lines',          'created_by',           'budget_lines_created_by_fkey'),
      ('budget_lines',          'updated_by',           'budget_lines_updated_by_fkey'),
      ('budget_versions',       'approved_by',          'budget_versions_approved_by_fkey'),
      ('budget_versions',       'created_by',           'budget_versions_created_by_fkey'),
      ('budget_versions',       'locked_by',            'budget_versions_locked_by_fkey'),
      ('budget_versions',       'submitted_by',         'budget_versions_submitted_by_fkey'),
      ('expense_reversals',     'reversed_by',          'expense_reversals_reversed_by_fkey'),
      ('expenses',              'entered_by',           'expenses_entered_by_fkey'),
      ('expenses',              'responsible_user_id',  'expenses_responsible_user_id_fkey'),
      ('expenses',              'reversed_by',          'expenses_reversed_by_fkey'),
      ('expenses',              'reviewed_by',          'expenses_reviewed_by_fkey'),
      ('expenses',              'updated_by',           'expenses_updated_by_fkey'),
      ('import_batches',        'approved_by',          'import_batches_approved_by_fkey'),
      ('import_batches',        'imported_by',          'import_batches_imported_by_fkey'),
      ('import_exceptions',     'owner_id',             'import_exceptions_owner_id_fkey'),
      ('import_exceptions',     'resolved_by',          'import_exceptions_resolved_by_fkey'),
      ('period_status_events',  'actor_id',             'period_status_events_actor_id_fkey'),
      ('reconciliation_runs',   'created_by',           'reconciliation_runs_created_by_fkey'),
      ('report_snapshots',      'generated_by',         'report_snapshots_generated_by_fkey'),
      ('revenue_plans',         'approved_by',          'revenue_plans_approved_by_fkey'),
      ('revenue_plans',         'created_by',           'revenue_plans_created_by_fkey'),
      ('revenue_plans',         'locked_by',            'revenue_plans_locked_by_fkey'),
      ('revenue_plans',         'submitted_by',         'revenue_plans_submitted_by_fkey'),
      ('revenue_reversals',     'reversed_by',          'revenue_reversals_reversed_by_fkey'),
      ('revenue_transactions',  'collector_user_id',    'revenue_transactions_collector_user_id_fkey'),
      ('revenue_transactions',  'entered_by',           'revenue_transactions_entered_by_fkey'),
      ('revenue_transactions',  'reversed_by',          'revenue_transactions_reversed_by_fkey'),
      ('system_settings',       'updated_by',           'system_settings_updated_by_fkey'),
      ('user_roles',            'granted_by',           'user_roles_granted_by_fkey'),
      ('user_roles',            'revoked_by',           'user_roles_revoked_by_fkey')
    ) AS expected(table_name, column_name, constraint_name)
  LOOP
    SELECT c.confrelid
    INTO v_target
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'fincore'
      AND rel.relname = v_fk.table_name
      AND c.conname = v_fk.constraint_name
      AND c.contype = 'f';

    IF v_target IS NULL THEN
      RAISE EXCEPTION 'required FK %.% (%) is missing',
        v_fk.table_name, v_fk.column_name, v_fk.constraint_name;
    ELSIF v_target = 'fincore.user_identities'::regclass THEN
      CONTINUE;
    ELSIF v_target <> 'fincore.users'::regclass THEN
      RAISE EXCEPTION 'FK % points to an unexpected relation', v_fk.constraint_name;
    END IF;

    EXECUTE format(
      'ALTER TABLE fincore.%I DROP CONSTRAINT %I',
      v_fk.table_name,
      v_fk.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE fincore.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES fincore.user_identities(id)',
      v_fk.table_name,
      v_fk.constraint_name,
      v_fk.column_name
    );
  END LOOP;
END;
$$;

-- Role assignments are disposable account authorization state. Their own
-- historical grant/revoke actor columns above continue to point at identities.
DO $$
DECLARE
  v_target OID;
  v_delete_action "char";
BEGIN
  SELECT confrelid, confdeltype
  INTO v_target, v_delete_action
  FROM pg_constraint
  WHERE conrelid = 'fincore.user_roles'::regclass
    AND conname = 'user_roles_user_id_fkey'
    AND contype = 'f';

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'required FK user_roles_user_id_fkey is missing';
  END IF;
  IF v_target <> 'fincore.users'::regclass THEN
    RAISE EXCEPTION 'user_roles_user_id_fkey must continue to reference users';
  END IF;
  IF v_delete_action <> 'c' THEN
    ALTER TABLE fincore.user_roles DROP CONSTRAINT user_roles_user_id_fkey;
    ALTER TABLE fincore.user_roles
      ADD CONSTRAINT user_roles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES fincore.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- Fail closed if an unclassified FK still points at the deletable account.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'fincore.users'::regclass
      AND NOT (
        c.conrelid = 'fincore.user_roles'::regclass
        AND c.conname = 'user_roles_user_id_fkey'
      )
  ) THEN
    RAISE EXCEPTION 'unclassified foreign key still references fincore.users';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fincore.fn_user_identity_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, fincore
AS $$
  SELECT display_name
  FROM fincore.user_identities
  WHERE id = p_user_id
$$;

REVOKE ALL ON FUNCTION fincore.fn_user_identity_name(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fincore.fn_user_identity_name(UUID)
  TO fincore_app, fincore_service;

-- Preserve ledger visibility after the authentication account disappears.
CREATE OR REPLACE VIEW fincore.v_unified_ledger
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.transaction_date,
  ap.year, ap.month, ap.id AS accounting_period_id, ap.status AS period_status,
  e.branch_id, b.name AS branch_name,
  e.category_id, c.name AS category_name, e.expense_type_snapshot,
  e.department_id, d.name AS department_name,
  e.payment_method_id, pm.name AS payment_method_name,
  e.responsible_user_id,
  fincore.fn_user_identity_name(e.responsible_user_id) AS responsible_user_name,
  e.entered_by,
  fincore.fn_user_identity_name(e.entered_by) AS entered_by_name,
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
JOIN fincore.payment_methods pm    ON pm.id = e.payment_method_id;

CREATE OR REPLACE VIEW fincore.v_revenue_ledger
WITH (security_invoker = true) AS
SELECT
  rt.id, rt.receipt_no,
  ap.year, ap.month, ap.id AS accounting_period_id, ap.status AS period_status,
  rt.branch_id, b.name AS branch_name,
  rt.payment_business_date, rt.amount_uzs,
  rt.payment_method_id, pm.name AS payment_method_name,
  rt.collector_user_id,
  fincore.fn_user_identity_name(rt.collector_user_id) AS collector_name,
  rt.entered_by,
  fincore.fn_user_identity_name(rt.entered_by) AS entered_by_name,
  rt.entered_on_behalf, rt.on_behalf_reason,
  rt.external_reference, rt.description,
  rt.status, rt.reversed_at, rt.reversed_by, rt.reversal_reason,
  rt.created_at, rt.updated_at
FROM fincore.revenue_transactions rt
JOIN fincore.accounting_periods ap ON ap.id = rt.accounting_period_id
JOIN fincore.branches b            ON b.id = rt.branch_id
JOIN fincore.payment_methods pm    ON pm.id = rt.payment_method_id;

CREATE OR REPLACE VIEW fincore.v_cashier_report
WITH (security_invoker = true) AS
WITH roster AS (
  SELECT
    ap.id AS period_id, ap.year, ap.month,
    br.id AS branch_id, br.name AS branch_name,
    ur.user_id AS collector_user_id
  FROM fincore.accounting_periods ap
  CROSS JOIN fincore.branches br
  JOIN fincore.user_roles ur
    ON ur.role_id = (SELECT id FROM fincore.roles WHERE code = 'cashier')
   AND ur.is_active
   AND ur.branch_id = br.id
  JOIN fincore.users u ON u.id = ur.user_id
  WHERE br.is_active

  UNION

  SELECT
    ap.id AS period_id, ap.year, ap.month,
    br.id AS branch_id, br.name AS branch_name,
    rt.collector_user_id
  FROM fincore.v_revenue_net_rows rt
  JOIN fincore.accounting_periods ap ON ap.id = rt.accounting_period_id
  JOIN fincore.branches br ON br.id = rt.branch_id
  WHERE br.is_active
  GROUP BY ap.id, ap.year, ap.month, br.id, br.name, rt.collector_user_id
), collected AS (
  SELECT accounting_period_id, branch_id, collector_user_id,
         SUM(amount_uzs) AS total_uzs, COUNT(*) AS txn_count
  FROM fincore.v_revenue_net_rows
  GROUP BY accounting_period_id, branch_id, collector_user_id
), branch_total AS (
  SELECT accounting_period_id, branch_id, SUM(amount_uzs) AS actual_uzs
  FROM fincore.v_revenue_net_rows
  GROUP BY accounting_period_id, branch_id
)
SELECT
  roster.period_id, roster.year, roster.month,
  roster.branch_id, roster.branch_name,
  roster.collector_user_id,
  fincore.fn_user_identity_name(roster.collector_user_id) AS collector_name,
  COALESCE(collected.total_uzs, 0) AS total_uzs,
  COALESCE(collected.txn_count, 0) AS txn_count,
  fincore.fn_safe_pct(COALESCE(collected.total_uzs, 0), branch_total.actual_uzs)
    AS cashier_share_pct
FROM roster
LEFT JOIN collected
  ON collected.accounting_period_id = roster.period_id
 AND collected.branch_id = roster.branch_id
 AND collected.collector_user_id = roster.collector_user_id
LEFT JOIN branch_total
  ON branch_total.accounting_period_id = roster.period_id
 AND branch_total.branch_id = roster.branch_id;

COMMENT ON VIEW fincore.v_cashier_report IS
  'FR-REV-13/BR-21: current cashiers remain zero-inclusive; deleted accounts remain visible only in periods where their immutable collector identity has revenue.';

UPDATE fincore.permissions
SET description = 'Boshqa foydalanuvchi hisobini tarixiy va moliyaviy yozuvlarni saqlagan holda butunlay o‘chirish'
WHERE code = 'user.delete';

COMMENT ON TABLE fincore.users IS
  'Deletable authentication/account record. Financial and audit attribution is preserved in fincore.user_identities. The reserved is_system row is the immutable fincore_service actor and cannot be deleted.';

COMMIT;
