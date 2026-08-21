-- ============================================================================
-- FINCORE — 001_reference_schema.sql
-- Executable PostgreSQL 16+ reference DDL.
-- Source of truth: docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md (v1.2, 2026-08-20)
-- Traceability: see docs/DATABASE_ARCHITECTURE.md section 4.
--
-- REVISION HISTORY
--   v1 (2026-08-20): initial reference schema.
--   v2 (2026-08-20): security/correctness remediation pass. This baseline has
--     never been applied to a production database (confirmed: no git repo,
--     no prior deployment evidence in this repository), so v2 rewrites 001
--     in place rather than adding a forward-only 005_*.sql. If this schema
--     is ever deployed to a real environment, ALL FUTURE changes must be
--     additive, forward-only migrations (005_, 006_, ...) — see
--     docs/DATABASE_MIGRATION_AND_OPERATIONS.md section 9.
--   Fixed in v2 (see docs/DATABASE_ARCHITECTURE.md section 25 for the full
--   remediation log):
--     1. trg_audit_after_write() is now SECURITY DEFINER, owned by a narrow
--        fincore_audit_writer role — it no longer silently breaks every
--        expense/revenue/budget write under fincore_app.
--     2. All actor identity now comes from a signed, backend-issued token
--        verified inside PostgreSQL (fincore.fn_current_actor_id()), never
--        from a client-settable p_actor_id parameter or an unsigned GUC.
--     3. fincore.users is no longer directly SELECT-able by fincore_app;
--        a safe directory function exposes only non-sensitive columns.
--     4. expenses/revenue_transactions are function-mediated only — direct
--        INSERT/UPDATE grants are revoked from fincore_app.
--     5. Report views (003) are rebuilt WITH (security_invoker = true).
--     6. Historical reporting no longer filters on current is_active/status;
--        category/type snapshots are extended to code+name.
--     7. revenue_transactions now stores a TIMESTAMPTZ payment_at with a
--        server-derived Asia/Tashkent business date, not a bare DATE.
--     8. A real PostgreSQL 16 CI workflow exists (.github/workflows/database-ci.yml).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Schema
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS fincore;
SET search_path TO fincore, pg_temp;

COMMENT ON SCHEMA fincore IS 'FINCORE V1 — financial control platform for a two-branch education center back office (no student domain).';

-- ----------------------------------------------------------------------------
-- 1. Extensions
-- ----------------------------------------------------------------------------
-- pgcrypto is required for HMAC-SHA256 verification of the signed actor
-- context (fn_current_actor_id, section 10) — core PostgreSQL has no HMAC
-- primitive. This is the ONLY extension this schema depends on; gen_random_uuid()
-- remains a PostgreSQL 13+ core builtin and needs no extension.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 2. Database roles
-- ----------------------------------------------------------------------------
-- fincore_migrator      : NOLOGIN, BYPASSRLS. Owns almost every object. Only
--                         used interactively by a deployment engineer who has
--                         been granted membership; never used by the running
--                         app. BYPASSRLS is required so its SECURITY DEFINER
--                         functions can read/write FORCE-RLS tables (expenses,
--                         revenue_transactions, ...) regardless of the calling
--                         session's app-level identity.
-- fincore_service       : NOLOGIN, BYPASSRLS. Trusted background-job role
--                         (import commit, report snapshots, scheduled
--                         reconciliation). fn_current_actor_id() recognizes
--                         `session_user = 'fincore_service'` as a fixed,
--                         non-impersonatable identity mapped to the single
--                         seeded system user — a background job can NEVER
--                         claim to be an arbitrary director by passing a UUID.
-- fincore_app           : NOLOGIN. Request-scoped API role. No BYPASSRLS, no
--                         table-level DML on financial fact tables, no SELECT
--                         on fincore.users, no EXECUTE beyond an explicit,
--                         named allow-list of API entry-point functions
--                         (section 15). This is the only role application
--                         backend connections ever assume.
-- fincore_audit_writer  : NOLOGIN. Owns ONLY the audit trigger function and
--                         holds ONLY INSERT on audit_logs (+ USAGE on the
--                         schema). No BYPASSRLS — it gets a dedicated,
--                         role-scoped RLS INSERT policy instead (section 14).
-- fincore_actor_verifier: NOLOGIN. Owns ONLY fn_current_actor_id and
--                         fn_constant_time_eq, and is the ONLY role with
--                         SELECT on fincore._actor_signing_keys. No BYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_migrator') THEN
    CREATE ROLE fincore_migrator NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_service') THEN
    CREATE ROLE fincore_service NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_app') THEN
    CREATE ROLE fincore_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_audit_writer') THEN
    CREATE ROLE fincore_audit_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_actor_verifier') THEN
    CREATE ROLE fincore_actor_verifier NOLOGIN;
  END IF;
END $$;

-- Actual LOGIN roles/passwords for connection pools are provisioned per
-- environment and granted membership in fincore_app / fincore_service only
-- (see docs/DATABASE_MIGRATION_AND_OPERATIONS.md section 5). No LOGIN role
-- is ever granted fincore_migrator, fincore_audit_writer, or
-- fincore_actor_verifier membership outside a controlled deployment session.

GRANT USAGE ON SCHEMA fincore TO fincore_service, fincore_app, fincore_audit_writer, fincore_actor_verifier;

-- Lock down the default privilege model BEFORE creating anything else:
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default (unlike
-- tables). Without this, every fn_* created below would be silently
-- PUBLIC-executable the instant it is created.
ALTER DEFAULT PRIVILEGES FOR ROLE fincore_migrator IN SCHEMA fincore REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE fincore_audit_writer IN SCHEMA fincore REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE fincore_actor_verifier IN SCHEMA fincore REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. Domains for money
-- ----------------------------------------------------------------------------

CREATE DOMAIN fincore.uzs_amount_positive AS BIGINT
  CONSTRAINT uzs_amount_positive_check CHECK (VALUE > 0);

CREATE DOMAIN fincore.uzs_amount_nonnegative AS BIGINT
  CONSTRAINT uzs_amount_nonnegative_check CHECK (VALUE >= 0);

COMMENT ON DOMAIN fincore.uzs_amount_positive IS 'Whole UZS, no tiyin, must be strictly positive (real money movement).';
COMMENT ON DOMAIN fincore.uzs_amount_nonnegative IS 'Whole UZS, no tiyin, may be zero (a deliberate zero plan).';

-- ----------------------------------------------------------------------------
-- 4. Enumerated types
-- ----------------------------------------------------------------------------

CREATE TYPE fincore.expense_type            AS ENUM ('fixed', 'variable');
CREATE TYPE fincore.user_status             AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE fincore.expense_status          AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'reversed');
CREATE TYPE fincore.budget_status           AS ENUM ('draft', 'submitted', 'approved', 'locked');
CREATE TYPE fincore.revenue_plan_status     AS ENUM ('draft', 'submitted', 'approved', 'locked');
CREATE TYPE fincore.revenue_status          AS ENUM ('posted', 'reversed');
CREATE TYPE fincore.period_status           AS ENUM ('open', 'closed');
CREATE TYPE fincore.period_event_type       AS ENUM ('closed', 'reopened');
CREATE TYPE fincore.import_batch_status     AS ENUM ('pending', 'previewing', 'approved_for_commit', 'committed', 'failed', 'rolled_back');
CREATE TYPE fincore.import_row_status       AS ENUM ('pending', 'normalized', 'valid', 'exception', 'committed', 'duplicate_flagged', 'skipped');
CREATE TYPE fincore.import_issue_type       AS ENUM ('invalid_date', 'unknown_category', 'missing_department', 'missing_responsible',
                                                      'wrong_year', 'unknown_master_value', 'duplicate_candidate', 'branch_mismatch',
                                                      'missing_cashier', 'missing_payment_method', 'duplicate_external_reference', 'other');
CREATE TYPE fincore.import_issue_severity   AS ENUM ('warning', 'error');
CREATE TYPE fincore.import_issue_status     AS ENUM ('open', 'resolved', 'ignored');
CREATE TYPE fincore.audit_result            AS ENUM ('success', 'denied', 'failed');
CREATE TYPE fincore.reconciliation_status   AS ENUM ('match', 'mismatch');

-- ----------------------------------------------------------------------------
-- 5. Generic trigger helper functions (no table dependency)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fincore.trg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fincore.trg_touch_updated_at_versioned()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fincore.trg_reject_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; hard delete of row % is not permitted', TG_TABLE_NAME, OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION fincore.trg_reject_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable once written', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- ============================================================================
-- 6. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6.1 system_settings
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);

COMMENT ON TABLE fincore.system_settings IS 'Key/value policy switches. Seeded in 002.';

-- ----------------------------------------------------------------------------
-- 6.2 users — never hard-deleted
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
  phone         TEXT UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  status        fincore.user_status NOT NULL DEFAULT 'active',
  is_system     BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INT NOT NULL DEFAULT 1,
  CONSTRAINT users_login_identifier_present CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

COMMENT ON TABLE fincore.users IS 'Never hard-deleted. password_hash is NEVER exposed to fincore_app (no table grant — see fn_user_directory, section 11, and grants section 15). Deactivate via status to preserve entered_by/collector_user_id/actor history.';
COMMENT ON COLUMN fincore.users.password_hash IS 'Authentication-path secret. No view, function result, audit payload, or report may ever surface this column to fincore_app. Only fincore_migrator/fincore_service (both trusted, non-app roles) can read it, e.g. for a dedicated login-verification path outside this schema.';
COMMENT ON COLUMN fincore.users.is_system IS 'True only for the single seeded system actor. fn_current_actor_id() maps ALL fincore_service connections to this row — a background job can never claim to be an arbitrary director.';

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON fincore.users
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at_versioned();

ALTER TABLE fincore.system_settings
  ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES fincore.users(id);

-- ----------------------------------------------------------------------------
-- 6.3 roles / permissions / role_permissions / user_roles
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.roles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allows_all_branch_scope BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fincore.permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fincore.role_permissions (
  role_id       UUID NOT NULL REFERENCES fincore.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES fincore.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

COMMENT ON TABLE fincore.role_permissions IS 'CASCADE here is safe: it only removes a role<->permission mapping, never a financial fact.';

CREATE TABLE fincore.user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES fincore.users(id),
  role_id     UUID NOT NULL REFERENCES fincore.roles(id),
  branch_id   UUID,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  granted_by  UUID NOT NULL REFERENCES fincore.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by  UUID REFERENCES fincore.users(id),
  revoked_at  TIMESTAMPTZ,
  CONSTRAINT user_roles_revocation_consistent CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  -- is_active and revoked_at are kept as two independently-checkable columns
  -- (the remediation prompt explicitly requires checking BOTH), but this
  -- CHECK guarantees they can never diverge: revoking always flips is_active
  -- to false in the same statement, and a still-active row is never revoked.
  CONSTRAINT user_roles_active_matches_revocation CHECK (is_active = (revoked_at IS NULL))
);

COMMENT ON TABLE fincore.user_roles IS 'One user may hold multiple (role, branch) assignments. Never physically deleted, only revoked (is_active=false AND revoked_at set together, enforced by CHECK), so a permission audit remains reconstructible.';

CREATE UNIQUE INDEX user_roles_unique_active_assignment
  ON fincore.user_roles (user_id, role_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'))
  WHERE is_active;

CREATE INDEX user_roles_by_user ON fincore.user_roles (user_id) WHERE is_active;
CREATE INDEX user_roles_by_role_branch ON fincore.user_roles (role_id, branch_id) WHERE is_active;

-- ----------------------------------------------------------------------------
-- 6.4 branches
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.branches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fincore.branches IS 'Dynamic table, not an enum. Seeded with exactly Sayxun and Xalqlar do''stligi. "Barchasi" is a report filter, never a row here. is_active affects only NEW-entry selectors — historical facts referencing a deactivated branch remain fully reported (see v_* views in 003, none of which filter is_active for historical aggregation).';

CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON fincore.branches
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at();

ALTER TABLE fincore.user_roles
  ADD CONSTRAINT user_roles_branch_fkey FOREIGN KEY (branch_id) REFERENCES fincore.branches(id);

CREATE OR REPLACE FUNCTION fincore.trg_user_roles_validate_branch_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_allows_all boolean;
BEGIN
  SELECT allows_all_branch_scope INTO v_allows_all FROM fincore.roles WHERE id = NEW.role_id;
  IF NEW.branch_id IS NULL AND NOT COALESCE(v_allows_all, false) THEN
    RAISE EXCEPTION 'role % may not be granted with an all-branch (NULL) scope', NEW.role_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_roles_branch_scope BEFORE INSERT OR UPDATE ON fincore.user_roles
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_user_roles_validate_branch_scope();

-- ----------------------------------------------------------------------------
-- 6.5 reference/master data
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.payment_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_payment_methods_updated_at BEFORE UPDATE ON fincore.payment_methods
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at();

CREATE TABLE fincore.departments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON fincore.departments
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at();

CREATE TABLE fincore.expense_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  expense_type fincore.expense_type NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN fincore.expense_categories.expense_type IS 'Fixed attribute of the category card. Never user-editable per row; snapshotted (code+name+type) onto expenses/budget_lines at write time by trg_expense_derive_period_and_snapshot / trg_budget_line_derive_snapshot.';

CREATE TRIGGER trg_expense_categories_updated_at BEFORE UPDATE ON fincore.expense_categories
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at();

CREATE TABLE fincore.category_aliases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      UUID NOT NULL REFERENCES fincore.expense_categories(id),
  alias_text       TEXT NOT NULL,
  normalized_alias TEXT GENERATED ALWAYS AS (regexp_replace(lower(trim(alias_text)), '\s*,\s*|\s+', ' ', 'g')) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX category_aliases_normalized_unique ON fincore.category_aliases (normalized_alias);
CREATE INDEX category_aliases_by_category ON fincore.category_aliases (category_id);

-- ----------------------------------------------------------------------------
-- 6.6 accounting_periods + period_status_events
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.accounting_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year          SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        fincore.period_status NOT NULL DEFAULT 'open',
  closed_at     TIMESTAMPTZ,
  closed_by     UUID REFERENCES fincore.users(id),
  closed_note   TEXT,
  reopened_at   TIMESTAMPTZ,
  reopened_by   UUID REFERENCES fincore.users(id),
  reopen_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

COMMENT ON TABLE fincore.accounting_periods IS 'Mutated ONLY through fincore.fn_close_period / fn_reopen_period. fincore_app has no direct UPDATE grant.';

CREATE TABLE fincore.period_status_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id  UUID NOT NULL REFERENCES fincore.accounting_periods(id),
  event_type fincore.period_event_type NOT NULL,
  actor_id   UUID NOT NULL REFERENCES fincore.users(id),
  reason     TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT period_status_events_reopen_reason_required
    CHECK (event_type <> 'reopened' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
);

CREATE INDEX period_status_events_by_period ON fincore.period_status_events (period_id, occurred_at DESC);

-- Append-only backstop (workstream 1): no role, including the table owner,
-- may UPDATE or DELETE a history row through ordinary DML.
CREATE TRIGGER trg_period_status_events_no_update BEFORE UPDATE ON fincore.period_status_events
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_update();
CREATE TRIGGER trg_period_status_events_no_delete BEFORE DELETE ON fincore.period_status_events
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_delete();

CREATE OR REPLACE FUNCTION fincore.fn_ensure_period(p_year INT, p_month INT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, fincore
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO fincore.accounting_periods (year, month, status)
  VALUES (p_year, p_month, 'open')
  ON CONFLICT (year, month) DO NOTHING;

  SELECT id INTO v_id FROM fincore.accounting_periods WHERE year = p_year AND month = p_month;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION fincore.fn_ensure_period IS 'Internal helper only — invoked from BEFORE INSERT triggers, never granted EXECUTE to fincore_app directly (workstream 2: "do not grant application roles direct access to ... derivation ... internal helper functions"). SECURITY DEFINER so it can INSERT into accounting_periods regardless of the calling role''s own grants.';

-- ----------------------------------------------------------------------------
-- 6.7 budget_versions + budget_lines
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.budget_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id     UUID NOT NULL REFERENCES fincore.accounting_periods(id),
  revision_no   INT NOT NULL CHECK (revision_no > 0),
  status        fincore.budget_status NOT NULL DEFAULT 'draft',
  is_applicable BOOLEAN NOT NULL DEFAULT false,
  reason        TEXT,
  created_by    UUID NOT NULL REFERENCES fincore.users(id),
  submitted_by  UUID REFERENCES fincore.users(id),
  submitted_at  TIMESTAMPTZ,
  approved_by   UUID REFERENCES fincore.users(id),
  approved_at   TIMESTAMPTZ,
  locked_by     UUID REFERENCES fincore.users(id),
  locked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INT NOT NULL DEFAULT 1,
  UNIQUE (period_id, revision_no)
);

CREATE UNIQUE INDEX budget_versions_one_applicable_per_period
  ON fincore.budget_versions (period_id) WHERE is_applicable;

CREATE INDEX budget_versions_by_period_status ON fincore.budget_versions (period_id, status);

CREATE TRIGGER trg_budget_versions_updated_at BEFORE UPDATE ON fincore.budget_versions
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at_versioned();

CREATE TABLE fincore.budget_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id              UUID NOT NULL REFERENCES fincore.budget_versions(id),
  branch_id               UUID NOT NULL REFERENCES fincore.branches(id),
  category_id             UUID NOT NULL REFERENCES fincore.expense_categories(id),
  expense_type_snapshot   fincore.expense_type NOT NULL,
  category_code_snapshot  TEXT NOT NULL,
  category_name_snapshot  TEXT NOT NULL,
  planned_amount_uzs      fincore.uzs_amount_nonnegative NOT NULL,
  reason                  TEXT,
  created_by              UUID NOT NULL REFERENCES fincore.users(id),
  updated_by              UUID REFERENCES fincore.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version_id, branch_id, category_id)
);

COMMENT ON COLUMN fincore.budget_lines.planned_amount_uzs IS 'NULL/no-row = category not planned. 0 = deliberately planned at zero. Never conflate the two in reports.';
COMMENT ON COLUMN fincore.budget_lines.expense_type_snapshot IS 'Server-derived by trg_budget_line_derive_snapshot from category_id — the client cannot set or edit this; any client-supplied value is silently overwritten before INSERT.';
COMMENT ON COLUMN fincore.budget_lines.category_code_snapshot IS 'Server-derived alongside expense_type_snapshot. A later category code/name/type change never rewrites an already-written budget line''s historical label (AC-13-equivalent for budget history).';

CREATE INDEX budget_lines_by_version ON fincore.budget_lines (version_id);
CREATE INDEX budget_lines_by_branch_category ON fincore.budget_lines (branch_id, category_id);

CREATE TRIGGER trg_budget_lines_updated_at BEFORE UPDATE ON fincore.budget_lines
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at();

-- Server-derives category snapshots on every insert/category change, always
-- overwriting whatever the client sent (workstream 4/6: snapshot fields are
-- never client-controlled).
CREATE OR REPLACE FUNCTION fincore.trg_budget_line_derive_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_code TEXT; v_name TEXT; v_type fincore.expense_type;
BEGIN
  SELECT code, name, expense_type INTO v_code, v_name, v_type
    FROM fincore.expense_categories WHERE id = NEW.category_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'expense category % not found', NEW.category_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.category_code_snapshot := v_code;
  NEW.category_name_snapshot := v_name;
  NEW.expense_type_snapshot := v_type;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_budget_lines_derive_snapshot
  BEFORE INSERT OR UPDATE OF category_id ON fincore.budget_lines
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_budget_line_derive_snapshot();

-- ----------------------------------------------------------------------------
-- 6.8 revenue_plans
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.revenue_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id          UUID NOT NULL REFERENCES fincore.accounting_periods(id),
  branch_id          UUID NOT NULL REFERENCES fincore.branches(id),
  revision_no        INT NOT NULL CHECK (revision_no > 0),
  planned_amount_uzs fincore.uzs_amount_nonnegative NOT NULL,
  status             fincore.revenue_plan_status NOT NULL DEFAULT 'draft',
  is_applicable      BOOLEAN NOT NULL DEFAULT false,
  reason             TEXT,
  created_by         UUID NOT NULL REFERENCES fincore.users(id),
  submitted_by       UUID REFERENCES fincore.users(id),
  submitted_at       TIMESTAMPTZ,
  approved_by        UUID REFERENCES fincore.users(id),
  approved_at        TIMESTAMPTZ,
  locked_by          UUID REFERENCES fincore.users(id),
  locked_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  version            INT NOT NULL DEFAULT 1,
  UNIQUE (period_id, branch_id, revision_no)
);

COMMENT ON TABLE fincore.revenue_plans IS 'The center-wide plan is NEVER a stored "Barchasi" row — SUM() over the applicable approved row per branch.';

CREATE UNIQUE INDEX revenue_plans_one_applicable_per_period_branch
  ON fincore.revenue_plans (period_id, branch_id) WHERE is_applicable;

CREATE INDEX revenue_plans_by_period_branch_status ON fincore.revenue_plans (period_id, branch_id, status);

CREATE TRIGGER trg_revenue_plans_updated_at BEFORE UPDATE ON fincore.revenue_plans
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at_versioned();

-- ----------------------------------------------------------------------------
-- 6.9 import_batches
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.import_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_workbook  TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  sheet_names      TEXT[] NOT NULL DEFAULT '{}',
  status           fincore.import_batch_status NOT NULL DEFAULT 'pending',
  preview_summary  JSONB,
  imported_by      UUID NOT NULL REFERENCES fincore.users(id),
  approved_by      UUID REFERENCES fincore.users(id),
  approved_at      TIMESTAMPTZ,
  committed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX import_batches_by_status ON fincore.import_batches (status, created_at DESC);
CREATE UNIQUE INDEX import_batches_source_hash_unique ON fincore.import_batches (source_file_hash);

CREATE TRIGGER trg_import_batches_updated_at BEFORE UPDATE ON fincore.import_batches
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 6.10 expenses + expense_reversals
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.expenses (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date        DATE NOT NULL,
  accounting_period_id    UUID NOT NULL REFERENCES fincore.accounting_periods(id),
  branch_id               UUID NOT NULL REFERENCES fincore.branches(id),
  category_id             UUID NOT NULL REFERENCES fincore.expense_categories(id),
  expense_type_snapshot   fincore.expense_type NOT NULL,
  category_code_snapshot  TEXT NOT NULL,
  category_name_snapshot  TEXT NOT NULL,
  description             TEXT NOT NULL CHECK (length(trim(description)) > 0),
  amount_uzs              fincore.uzs_amount_positive NOT NULL,
  payment_method_id       UUID NOT NULL REFERENCES fincore.payment_methods(id),
  department_id           UUID NOT NULL REFERENCES fincore.departments(id),
  responsible_user_id     UUID NOT NULL REFERENCES fincore.users(id),
  comment                 TEXT,
  entered_by              UUID NOT NULL REFERENCES fincore.users(id),
  status                  fincore.expense_status NOT NULL DEFAULT 'approved',
  reviewed_by             UUID REFERENCES fincore.users(id),
  reviewed_at             TIMESTAMPTZ,
  rejection_reason        TEXT,
  is_reversed             BOOLEAN NOT NULL DEFAULT false,
  reversed_at             TIMESTAMPTZ,
  reversed_by             UUID REFERENCES fincore.users(id),
  reversal_reason         TEXT,
  idempotency_key         TEXT,
  source_workbook         TEXT,
  source_sheet            TEXT,
  source_row              INT,
  import_batch_id         UUID REFERENCES fincore.import_batches(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              UUID REFERENCES fincore.users(id),
  version                 INT NOT NULL DEFAULT 1,
  CONSTRAINT expenses_reversal_fields_consistent
    CHECK ((status = 'reversed') = (is_reversed AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL)),
  CONSTRAINT expenses_rejection_requires_reason
    CHECK (status <> 'rejected' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0))
);

COMMENT ON TABLE fincore.expenses IS 'The unified ledger IS this table. fincore_app has NO direct INSERT/UPDATE/DELETE grant (workstream 4) — all writes go through fincore.fn_create_expense / fn_update_expense / fn_submit_expense / fn_approve_expense / fn_reject_expense / fn_reverse_expense. Guard triggers (trg_expenses_guard) remain in place as a backstop even though the grant is gone, so a future accidental broadened grant would still be safe.';
COMMENT ON COLUMN fincore.expenses.accounting_period_id IS 'Server-derived from transaction_date by trg_expense_derive_period_and_snapshot — never accepted from a client-callable function parameter.';
COMMENT ON COLUMN fincore.expenses.category_code_snapshot IS 'Server-derived, immutable historical label. A later category rename/retype does not alter this row (AC-13).';
COMMENT ON COLUMN fincore.expenses.idempotency_key IS 'Optional client-supplied retry key (NFR-PERF-05). fn_create_expense treats a repeated key as a safe no-op that returns the original row id instead of inserting a duplicate.';

CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON fincore.expenses
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at_versioned();

CREATE UNIQUE INDEX expenses_idempotency_key_unique ON fincore.expenses (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE fincore.expense_reversals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_expense_id UUID NOT NULL UNIQUE REFERENCES fincore.expenses(id),
  reason              TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  reversed_by         UUID NOT NULL REFERENCES fincore.users(id),
  reversed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_expense_reversals_no_update BEFORE UPDATE ON fincore.expense_reversals
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_update();
CREATE TRIGGER trg_expense_reversals_no_delete BEFORE DELETE ON fincore.expense_reversals
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_delete();

CREATE INDEX expenses_ledger_order
  ON fincore.expenses (transaction_date DESC, created_at DESC, id DESC);
CREATE INDEX expenses_by_period_branch
  ON fincore.expenses (accounting_period_id, branch_id);
CREATE INDEX expenses_by_branch_category_type
  ON fincore.expenses (branch_id, category_id, expense_type_snapshot);
CREATE INDEX expenses_by_department ON fincore.expenses (department_id);
CREATE INDEX expenses_by_payment_method ON fincore.expenses (payment_method_id);
CREATE INDEX expenses_by_responsible_user ON fincore.expenses (responsible_user_id);
CREATE INDEX expenses_by_entered_by ON fincore.expenses (entered_by);
CREATE INDEX expenses_by_status ON fincore.expenses (status) WHERE status <> 'approved';
CREATE INDEX expenses_by_import_batch ON fincore.expenses (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX expenses_net_lookup
  ON fincore.expenses (accounting_period_id, branch_id, category_id)
  WHERE status = 'approved' AND NOT is_reversed;

-- ----------------------------------------------------------------------------
-- 6.11 revenue_transactions + revenue_reversals
-- ----------------------------------------------------------------------------
-- payment_at is the canonical event timestamp (TIMESTAMPTZ, stored UTC).
-- payment_business_date is server-derived (Asia/Tashkent local calendar
-- date) by trg_revenue_derive_period below — never client-suppliable.

CREATE SEQUENCE fincore.revenue_receipt_no_seq START WITH 100000;

CREATE TABLE fincore.revenue_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no            BIGINT NOT NULL DEFAULT nextval('fincore.revenue_receipt_no_seq') UNIQUE,
  branch_id             UUID NOT NULL REFERENCES fincore.branches(id),
  accounting_period_id  UUID NOT NULL REFERENCES fincore.accounting_periods(id),
  payment_at            TIMESTAMPTZ NOT NULL,
  payment_business_date DATE NOT NULL,
  time_known            BOOLEAN NOT NULL DEFAULT true,
  amount_uzs            fincore.uzs_amount_positive NOT NULL,
  payment_method_id     UUID NOT NULL REFERENCES fincore.payment_methods(id),
  collector_user_id     UUID NOT NULL REFERENCES fincore.users(id),
  entered_by            UUID NOT NULL REFERENCES fincore.users(id),
  entered_on_behalf     BOOLEAN NOT NULL DEFAULT false,
  on_behalf_reason      TEXT,
  external_reference    TEXT,
  description           TEXT,
  status                fincore.revenue_status NOT NULL DEFAULT 'posted',
  reversed_at           TIMESTAMPTZ,
  reversed_by           UUID REFERENCES fincore.users(id),
  reversal_reason       TEXT,
  idempotency_key       TEXT,
  source_workbook       TEXT,
  source_sheet          TEXT,
  source_row            INT,
  import_batch_id       UUID REFERENCES fincore.import_batches(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT revenue_transactions_on_behalf_consistent
    CHECK (entered_on_behalf = (entered_by <> collector_user_id)),
  CONSTRAINT revenue_transactions_on_behalf_reason_required
    CHECK (NOT entered_on_behalf OR (on_behalf_reason IS NOT NULL AND length(trim(on_behalf_reason)) > 0)),
  CONSTRAINT revenue_transactions_reversal_fields_consistent
    CHECK ((status = 'reversed') = (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL))
);

COMMENT ON TABLE fincore.revenue_transactions IS 'Truly append-only. fincore_app has NO direct INSERT/UPDATE grant — all writes go through fincore.fn_create_revenue_transaction / fn_reverse_revenue_transaction.';
COMMENT ON COLUMN fincore.revenue_transactions.payment_at IS 'Canonical event timestamp, TIMESTAMPTZ, stored UTC. This — never created_at — is the business payment time (hard requirement: do not use created_at as payment time).';
COMMENT ON COLUMN fincore.revenue_transactions.payment_business_date IS 'Server-derived: (payment_at AT TIME ZONE ''Asia/Tashkent'')::date, set by trg_revenue_derive_period. This is what accounting_period_id and all period-boundary logic key off — never payment_at''s raw UTC date, which can differ by one day near midnight in Tashkent.';
COMMENT ON COLUMN fincore.revenue_transactions.time_known IS 'false only for legacy-imported rows where the source workbook had a date but no time. See fn_create_revenue_transaction / import mapping: such rows use a documented deterministic local-midnight convention (payment_at = business_date 00:00:00 Asia/Tashkent) and time_known=false so reports can render "time unavailable".';
COMMENT ON COLUMN fincore.revenue_transactions.collector_user_id IS 'The cashier who actually received the money. Cashier reports aggregate on THIS column, never on entered_by.';

CREATE TRIGGER trg_revenue_transactions_updated_at BEFORE UPDATE ON fincore.revenue_transactions
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at();

CREATE UNIQUE INDEX revenue_transactions_idempotency_key_unique ON fincore.revenue_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE fincore.revenue_reversals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_transaction_id UUID NOT NULL UNIQUE REFERENCES fincore.revenue_transactions(id),
  reason                   TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  reversed_by              UUID NOT NULL REFERENCES fincore.users(id),
  reversed_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_revenue_reversals_no_update BEFORE UPDATE ON fincore.revenue_reversals
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_update();
CREATE TRIGGER trg_revenue_reversals_no_delete BEFORE DELETE ON fincore.revenue_reversals
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_delete();

CREATE INDEX revenue_transactions_ledger_order
  ON fincore.revenue_transactions (payment_at DESC, created_at DESC, id DESC);
CREATE INDEX revenue_transactions_by_period_branch
  ON fincore.revenue_transactions (accounting_period_id, branch_id);
CREATE INDEX revenue_transactions_by_collector
  ON fincore.revenue_transactions (branch_id, accounting_period_id, collector_user_id);
CREATE INDEX revenue_transactions_by_payment_method
  ON fincore.revenue_transactions (payment_method_id);
CREATE INDEX revenue_transactions_by_status ON fincore.revenue_transactions (status) WHERE status = 'reversed';
CREATE INDEX revenue_transactions_by_import_batch
  ON fincore.revenue_transactions (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX revenue_transactions_net_lookup
  ON fincore.revenue_transactions (accounting_period_id, branch_id, payment_method_id)
  WHERE status = 'posted';
CREATE INDEX revenue_transactions_by_business_date ON fincore.revenue_transactions (payment_business_date DESC);

CREATE UNIQUE INDEX revenue_transactions_external_reference_unique
  ON fincore.revenue_transactions (branch_id, payment_method_id, external_reference)
  WHERE external_reference IS NOT NULL AND status = 'posted';

-- ----------------------------------------------------------------------------
-- 6.12 import_rows, import_exceptions, reconciliation_runs
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.import_rows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID NOT NULL REFERENCES fincore.import_batches(id),
  source_sheet        TEXT NOT NULL,
  source_row          INT NOT NULL,
  raw_payload         JSONB NOT NULL,
  normalized_payload  JSONB,
  target_entity       TEXT NOT NULL,
  target_row_id       UUID,
  status              fincore.import_row_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_sheet, source_row),
  CONSTRAINT import_rows_target_entity_valid CHECK (target_entity IN ('expense', 'budget_line', 'revenue_transaction'))
);

CREATE INDEX import_rows_by_batch_status ON fincore.import_rows (batch_id, status);
CREATE INDEX import_rows_by_target ON fincore.import_rows (target_entity, target_row_id) WHERE target_row_id IS NOT NULL;

CREATE TRIGGER trg_import_rows_updated_at BEFORE UPDATE ON fincore.import_rows
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at();

CREATE TABLE fincore.import_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_row_id   UUID NOT NULL REFERENCES fincore.import_rows(id),
  issue_type      fincore.import_issue_type NOT NULL,
  severity        fincore.import_issue_severity NOT NULL,
  status          fincore.import_issue_status NOT NULL DEFAULT 'open',
  owner_id        UUID REFERENCES fincore.users(id),
  detail          TEXT,
  excluded_amount_uzs BIGINT,
  resolution_note TEXT,
  resolved_by     UUID REFERENCES fincore.users(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT import_exceptions_resolution_consistent
    CHECK ((status = 'open') OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

COMMENT ON TABLE fincore.import_exceptions IS 'DQ-02/DQ-05: exceptions never silently disappear from totals. excluded_amount_uzs is the canonical per-exception amount used by close-readiness/DQ reporting to avoid double counting when one import_row has multiple exception rows (see v_import_exception_summary in 003, which sums DISTINCT ON import_row_id, not raw exception rows).';

CREATE INDEX import_exceptions_open_by_severity
  ON fincore.import_exceptions (severity, created_at) WHERE status = 'open';
CREATE INDEX import_exceptions_by_row ON fincore.import_exceptions (import_row_id);
CREATE INDEX import_exceptions_by_owner ON fincore.import_exceptions (owner_id) WHERE status = 'open';

CREATE TABLE fincore.reconciliation_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type             TEXT NOT NULL,
  scope_type           TEXT NOT NULL,
  scope_id             TEXT NOT NULL,
  target_entity        TEXT,
  branch_id            UUID REFERENCES fincore.branches(id),
  accounting_period_id UUID REFERENCES fincore.accounting_periods(id),
  source_count         INT NOT NULL CHECK (source_count >= 0),
  source_sum           BIGINT NOT NULL,
  target_count         INT NOT NULL CHECK (target_count >= 0),
  target_sum           BIGINT NOT NULL,
  -- Sign convention (fixed, documented everywhere): diff = source - target.
  -- A positive diff means the source had MORE than what reached the target
  -- (facts missing/excluded) — exactly the shape of the historical
  -- 6,318,400 UZS Sheets defect (source 52,433,400 - legacy target
  -- 46,115,000 = +6,318,400).
  diff_count           INT GENERATED ALWAYS AS (source_count - target_count) STORED,
  diff_sum             BIGINT GENERATED ALWAYS AS (source_sum - target_sum) STORED,
  -- status is derived, not caller-suppliable: a caller cannot claim 'match'
  -- while count/sum actually differ.
  status                fincore.reconciliation_status GENERATED ALWAYS AS (
                           CASE WHEN source_count = target_count AND source_sum = target_sum
                                THEN 'match'::fincore.reconciliation_status
                                ELSE 'mismatch'::fincore.reconciliation_status END
                         ) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES fincore.users(id)
);

COMMENT ON TABLE fincore.reconciliation_runs IS 'Every import and every period close writes one row per reconciled (target_entity, branch, accounting_period) scope — never a single mixed expense/budget/revenue comparison. status is a GENERATED column so a caller cannot free-form assert "match" while the numbers disagree. Append-only (see triggers below); a correction creates a NEW row, never overwrites a prior mismatch.';

CREATE TRIGGER trg_reconciliation_runs_no_update BEFORE UPDATE ON fincore.reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_update();
CREATE TRIGGER trg_reconciliation_runs_no_delete BEFORE DELETE ON fincore.reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_delete();

CREATE INDEX reconciliation_runs_by_scope ON fincore.reconciliation_runs (run_type, scope_type, scope_id, created_at DESC);
CREATE INDEX reconciliation_runs_by_period_entity ON fincore.reconciliation_runs (accounting_period_id, target_entity, created_at DESC);
CREATE INDEX reconciliation_runs_mismatches ON fincore.reconciliation_runs (created_at DESC) WHERE status = 'mismatch';

-- ----------------------------------------------------------------------------
-- 6.13 audit_logs (append-only)
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.audit_logs (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id    UUID NOT NULL REFERENCES fincore.users(id),
  effective_role   TEXT,
  branch_id        UUID REFERENCES fincore.branches(id),
  action           TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  correlation_id   UUID,
  before_payload   JSONB,
  after_payload    JSONB,
  result           fincore.audit_result NOT NULL DEFAULT 'success',
  reason           TEXT,
  request_ip       INET,
  request_metadata JSONB,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fincore.audit_logs IS 'Append-only. actor_user_id is always the value returned by fincore.fn_current_actor_id() at write time — never a client-supplied entered_by/created_by/reversed_by. See fincore_audit_writer role (section 2) and trg_audit_after_write (section 9).';

CREATE INDEX audit_logs_by_date ON fincore.audit_logs (occurred_at DESC);
CREATE INDEX audit_logs_by_actor ON fincore.audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX audit_logs_by_entity ON fincore.audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_logs_by_branch_action ON fincore.audit_logs (branch_id, action, occurred_at DESC);
CREATE INDEX audit_logs_by_correlation ON fincore.audit_logs (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON fincore.audit_logs
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_update();
CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON fincore.audit_logs
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_delete();

-- ----------------------------------------------------------------------------
-- 6.14 attachments (V1.1 schema-ready extension)
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.attachments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id             UUID REFERENCES fincore.expenses(id),
  revenue_transaction_id UUID REFERENCES fincore.revenue_transactions(id),
  file_key               TEXT NOT NULL,
  file_name              TEXT NOT NULL,
  content_type           TEXT NOT NULL,
  size_bytes             BIGINT NOT NULL CHECK (size_bytes > 0),
  uploaded_by            UUID NOT NULL REFERENCES fincore.users(id),
  uploaded_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted             BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT attachments_exactly_one_owner
    CHECK (num_nonnulls(expense_id, revenue_transaction_id) = 1)
);

CREATE INDEX attachments_by_expense ON fincore.attachments (expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX attachments_by_revenue_transaction ON fincore.attachments (revenue_transaction_id) WHERE revenue_transaction_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 6.15 report_snapshots
-- ----------------------------------------------------------------------------

CREATE TABLE fincore.report_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       UUID NOT NULL REFERENCES fincore.accounting_periods(id),
  branch_id       UUID REFERENCES fincore.branches(id),
  report_type     TEXT NOT NULL,
  payload_summary JSONB NOT NULL,
  file_key        TEXT,
  generated_by    UUID NOT NULL REFERENCES fincore.users(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX report_snapshots_by_period ON fincore.report_snapshots (period_id, report_type, generated_at DESC);

-- ----------------------------------------------------------------------------
-- 6.16 _actor_signing_keys — internal, NEVER granted to fincore_app/PUBLIC
-- ----------------------------------------------------------------------------
-- The leading underscore is a naming convention (not a Postgres mechanism)
-- signaling "internal, never exposed to the app role directly" — enforced by
-- the grant model in section 15, not by the name.

CREATE TABLE fincore._actor_signing_keys (
  key_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hmac_key    BYTEA NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at  TIMESTAMPTZ,
  CONSTRAINT actor_signing_keys_key_length CHECK (octet_length(hmac_key) >= 32)
);

COMMENT ON TABLE fincore._actor_signing_keys IS 'Symmetric HMAC-SHA256 keys used to verify the signed actor-context token (see fn_current_actor_id, section 10). NEVER granted to fincore_app or PUBLIC (section 15) — only fincore_actor_verifier can SELECT it. The PRODUCTION key is never seeded by 002_seed_reference.sql or committed to source control; see docs/DATABASE_MIGRATION_AND_OPERATIONS.md section 6 for provisioning/rotation. Only 004_verification.sql inserts a disposable, clearly-labeled TEST-ONLY key.';

CREATE INDEX actor_signing_keys_active ON fincore._actor_signing_keys (key_id) WHERE is_active AND retired_at IS NULL;

REVOKE ALL ON fincore._actor_signing_keys FROM PUBLIC;

-- ============================================================================
-- 7. Expense/revenue period-derivation and category-snapshot triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION fincore.trg_expense_derive_period_and_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period_id     UUID;
  v_period_status fincore.period_status;
  v_code          TEXT;
  v_name          TEXT;
  v_type          fincore.expense_type;
BEGIN
  v_period_id := fincore.fn_ensure_period(EXTRACT(YEAR FROM NEW.transaction_date)::INT, EXTRACT(MONTH FROM NEW.transaction_date)::INT);

  SELECT status INTO v_period_status FROM fincore.accounting_periods WHERE id = v_period_id FOR SHARE;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'accounting period for % is closed', NEW.transaction_date
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'Reopen the period via fincore.fn_reopen_period first.';
  END IF;
  NEW.accounting_period_id := v_period_id;

  SELECT code, name, expense_type INTO v_code, v_name, v_type FROM fincore.expense_categories WHERE id = NEW.category_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'expense category % not found', NEW.category_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.category_code_snapshot := v_code;
  NEW.category_name_snapshot := v_name;
  NEW.expense_type_snapshot := v_type;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expenses_derive_period_snapshot
  BEFORE INSERT OR UPDATE OF transaction_date, category_id ON fincore.expenses
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_expense_derive_period_and_snapshot();

-- Revenue: derive accounting period AND the Asia/Tashkent business date from
-- the canonical payment_at timestamp. This is the ONLY place
-- payment_business_date is ever set — never accepted as a function
-- parameter, never client-editable.
CREATE OR REPLACE FUNCTION fincore.trg_revenue_derive_period()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period_id     UUID;
  v_period_status fincore.period_status;
  v_local_date    DATE;
BEGIN
  v_local_date := (NEW.payment_at AT TIME ZONE 'Asia/Tashkent')::date;
  NEW.payment_business_date := v_local_date;

  v_period_id := fincore.fn_ensure_period(EXTRACT(YEAR FROM v_local_date)::INT, EXTRACT(MONTH FROM v_local_date)::INT);

  SELECT status INTO v_period_status FROM fincore.accounting_periods WHERE id = v_period_id FOR SHARE;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'accounting period for % (Asia/Tashkent) is closed', v_local_date
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'Reopen the period via fincore.fn_reopen_period first.';
  END IF;
  NEW.accounting_period_id := v_period_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fincore.trg_revenue_derive_period IS 'AT TIME ZONE ''Asia/Tashkent'' conversion happens exactly once, here, server-side. A payment at 2026-08-31T23:30:00+05:00 (Asia/Tashkent local) and one at 2026-09-01T00:30:00+05:00 fall in different accounting periods even though they are one hour apart — see 004_verification.sql timezone-boundary tests.';

CREATE TRIGGER trg_revenue_transactions_derive_period
  BEFORE INSERT ON fincore.revenue_transactions
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_revenue_derive_period();

-- ============================================================================
-- 8. Immutability / period-lock guard triggers
-- ============================================================================
-- These remain in place as a defense-in-depth backstop EVEN THOUGH
-- fincore_app no longer holds a direct INSERT/UPDATE/DELETE grant on
-- expenses/revenue_transactions (section 15) — "the system must remain safe
-- if a future grant is accidentally broadened" (workstream 4).

CREATE OR REPLACE FUNCTION fincore.trg_expenses_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period_status fincore.period_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'expenses are append-only; hard delete of % is not permitted', OLD.id
      USING ERRCODE = 'restrict_violation', HINT = 'Use fincore.fn_reverse_expense instead.';
  END IF;

  IF OLD.status = 'approved' AND NEW.status = 'reversed'
     AND NOT OLD.is_reversed AND NEW.is_reversed
     AND ROW(NEW.transaction_date, NEW.branch_id, NEW.category_id, NEW.description, NEW.amount_uzs,
             NEW.payment_method_id, NEW.department_id, NEW.responsible_user_id, NEW.entered_by, NEW.comment,
             NEW.category_code_snapshot, NEW.category_name_snapshot, NEW.idempotency_key)
       IS NOT DISTINCT FROM
         ROW(OLD.transaction_date, OLD.branch_id, OLD.category_id, OLD.description, OLD.amount_uzs,
             OLD.payment_method_id, OLD.department_id, OLD.responsible_user_id, OLD.entered_by, OLD.comment,
             OLD.category_code_snapshot, OLD.category_name_snapshot, OLD.idempotency_key)
  THEN
    SELECT status INTO v_period_status FROM fincore.accounting_periods WHERE id = NEW.accounting_period_id FOR SHARE;
    IF v_period_status = 'closed' THEN
      RAISE EXCEPTION 'accounting period is closed; reopen before reversing expense %', NEW.id
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_period_status FROM fincore.accounting_periods WHERE id = OLD.accounting_period_id FOR SHARE;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'accounting period is closed; expense % is immutable', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'Reopen the period, or create a correction after reopening.';
  END IF;
  IF OLD.status = 'reversed' THEN
    RAISE EXCEPTION 'expense % has already been reversed and cannot be edited further', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- Server-derived fields may never change via this generic path, even
  -- within an open period — only trg_expense_derive_period_and_snapshot may
  -- set them, and only in response to a transaction_date/category_id change.
  IF NEW.accounting_period_id IS DISTINCT FROM OLD.accounting_period_id AND NEW.transaction_date = OLD.transaction_date THEN
    RAISE EXCEPTION 'accounting_period_id is server-derived and cannot be changed directly'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expenses_guard BEFORE UPDATE OR DELETE ON fincore.expenses
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_expenses_guard();

CREATE OR REPLACE FUNCTION fincore.trg_revenue_transactions_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period_status fincore.period_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'revenue_transactions are append-only; hard delete of % is not permitted', OLD.id
      USING ERRCODE = 'restrict_violation', HINT = 'Use fincore.fn_reverse_revenue_transaction instead.';
  END IF;

  IF NOT (
    OLD.status = 'posted' AND NEW.status = 'reversed'
    AND ROW(NEW.branch_id, NEW.payment_at, NEW.payment_business_date, NEW.amount_uzs, NEW.payment_method_id, NEW.collector_user_id,
            NEW.entered_by, NEW.entered_on_behalf, NEW.on_behalf_reason, NEW.external_reference,
            NEW.description, NEW.receipt_no, NEW.idempotency_key)
      IS NOT DISTINCT FROM
        ROW(OLD.branch_id, OLD.payment_at, OLD.payment_business_date, OLD.amount_uzs, OLD.payment_method_id, OLD.collector_user_id,
            OLD.entered_by, OLD.entered_on_behalf, OLD.on_behalf_reason, OLD.external_reference,
            OLD.description, OLD.receipt_no, OLD.idempotency_key)
  ) THEN
    RAISE EXCEPTION 'revenue_transactions are immutable except a single posted->reversed transition (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation', HINT = 'Use fincore.fn_reverse_revenue_transaction.';
  END IF;

  SELECT status INTO v_period_status FROM fincore.accounting_periods WHERE id = NEW.accounting_period_id FOR SHARE;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'accounting period is closed; reopen before reversing revenue transaction %', NEW.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_revenue_transactions_guard BEFORE UPDATE OR DELETE ON fincore.revenue_transactions
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_revenue_transactions_guard();

CREATE OR REPLACE FUNCTION fincore.trg_budget_lines_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_version_status fincore.budget_status;
  v_period_id      UUID;
  v_period_status  fincore.period_status;
  v_row            fincore.budget_lines;
BEGIN
  v_row := COALESCE(NEW, OLD);
  SELECT status, period_id INTO v_version_status, v_period_id
    FROM fincore.budget_versions WHERE id = v_row.version_id FOR SHARE;
  IF v_version_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'budget lines can only be written while their version is in draft (version=%, status=%)', v_row.version_id, v_version_status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'Create a new revision via fincore.fn_create_budget_revision.';
  END IF;

  SELECT status INTO v_period_status FROM fincore.accounting_periods WHERE id = v_period_id FOR SHARE;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'accounting period is closed; cannot write budget lines for period %', v_period_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_budget_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON fincore.budget_lines
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_budget_lines_guard();

CREATE OR REPLACE FUNCTION fincore.trg_budget_versions_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period_status fincore.period_status;
BEGIN
  SELECT status INTO v_period_status FROM fincore.accounting_periods
   WHERE id = COALESCE(NEW.period_id, OLD.period_id) FOR SHARE;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'accounting period is closed; cannot write budget version %', COALESCE(NEW.id, OLD.id)
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'only draft budget versions may be deleted (version=%, status=%)', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = NEW.status THEN
    IF OLD.is_applicable AND NOT NEW.is_applicable
       AND ROW(NEW.period_id, NEW.revision_no, NEW.status, NEW.reason, NEW.created_by, NEW.submitted_by,
               NEW.submitted_at, NEW.approved_by, NEW.approved_at, NEW.locked_by, NEW.locked_at)
         IS NOT DISTINCT FROM
           ROW(OLD.period_id, OLD.revision_no, OLD.status, OLD.reason, OLD.created_by, OLD.submitted_by,
               OLD.submitted_at, OLD.approved_by, OLD.approved_at, OLD.locked_by, OLD.locked_at)
    THEN
      RETURN NEW;
    END IF;

    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'budget version % is % and immutable outside a recognized state transition', OLD.id, OLD.status
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'Create a new revision via fincore.fn_create_budget_revision.';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT ( (OLD.status = 'draft'     AND NEW.status = 'submitted') OR
           (OLD.status = 'submitted' AND NEW.status = 'draft')     OR
           (OLD.status = 'submitted' AND NEW.status = 'approved')  OR
           (OLD.status = 'approved'  AND NEW.status = 'locked') ) THEN
    RAISE EXCEPTION 'invalid budget version transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_budget_versions_guard BEFORE UPDATE OR DELETE ON fincore.budget_versions
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_budget_versions_guard();

CREATE OR REPLACE FUNCTION fincore.trg_revenue_plans_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period_status fincore.period_status;
BEGIN
  SELECT status INTO v_period_status FROM fincore.accounting_periods
   WHERE id = COALESCE(NEW.period_id, OLD.period_id) FOR SHARE;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'accounting period is closed; cannot write revenue plan %', COALESCE(NEW.id, OLD.id)
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'only draft revenue plans may be deleted (id=%, status=%)', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = NEW.status THEN
    IF OLD.is_applicable AND NOT NEW.is_applicable
       AND ROW(NEW.period_id, NEW.branch_id, NEW.revision_no, NEW.planned_amount_uzs, NEW.status, NEW.reason,
               NEW.created_by, NEW.submitted_by, NEW.submitted_at, NEW.approved_by, NEW.approved_at,
               NEW.locked_by, NEW.locked_at)
         IS NOT DISTINCT FROM
           ROW(OLD.period_id, OLD.branch_id, OLD.revision_no, OLD.planned_amount_uzs, OLD.status, OLD.reason,
               OLD.created_by, OLD.submitted_by, OLD.submitted_at, OLD.approved_by, OLD.approved_at,
               OLD.locked_by, OLD.locked_at)
    THEN
      RETURN NEW;
    END IF;

    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'revenue plan % is % and immutable outside a recognized state transition', OLD.id, OLD.status
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'Create a new revision via fincore.fn_create_revenue_plan_revision.';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT ( (OLD.status = 'draft'     AND NEW.status = 'submitted') OR
           (OLD.status = 'submitted' AND NEW.status = 'draft')     OR
           (OLD.status = 'submitted' AND NEW.status = 'approved')  OR
           (OLD.status = 'approved'  AND NEW.status = 'locked') ) THEN
    RAISE EXCEPTION 'invalid revenue plan transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_revenue_plans_guard BEFORE UPDATE OR DELETE ON fincore.revenue_plans
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_revenue_plans_guard();

CREATE OR REPLACE FUNCTION fincore.trg_accounting_periods_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('fincore.allow_period_status_change', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'accounting_periods.status may only change via fincore.fn_close_period / fincore.fn_reopen_period'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounting_periods_guard BEFORE UPDATE ON fincore.accounting_periods
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fincore.trg_accounting_periods_guard();

-- ============================================================================
-- 9. Audit trigger — WORKSTREAM 1 fix
-- ============================================================================
-- Previous defect: this trigger ran with the CALLING role's privileges
-- (fincore_app), which never held INSERT on audit_logs — every expense/
-- revenue/budget_line write rolled back with a permission error the instant
-- this trigger fired. Fix: SECURITY DEFINER, owned by fincore_audit_writer
-- (a narrow, NOLOGIN, non-BYPASSRLS role that holds ONLY INSERT on
-- audit_logs), with a fixed trusted search_path and a role-scoped RLS INSERT
-- policy (section 14) as a second, independent enforcement layer. There is
-- NO exception handler around the INSERT — if it fails for any reason, the
-- whole triggering statement (and therefore the financial mutation) rolls
-- back with it. This is intentional: "audit failures must never be
-- swallowed" and "if audit writing fails, the financial mutation must also
-- fail" are the same guarantee, achieved by NOT catching the exception.

CREATE OR REPLACE FUNCTION fincore.trg_audit_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, fincore
AS $$
DECLARE
  v_actor    UUID;
  v_action   TEXT;
  v_branch   UUID;
  v_new_json JSONB := to_jsonb(NEW);
  v_old_json JSONB;
BEGIN
  -- The actor is ALWAYS the authenticated request actor, resolved server-
  -- side — never a client-supplied entered_by/created_by/reversed_by column
  -- value. This closes the "audit actor must come from the authenticated
  -- request context" requirement even for the plain INSERT/UPDATE safety-net
  -- path (the richer fn_* business functions already did this correctly).
  v_actor := fincore.fn_current_actor_id();

  v_branch := NULLIF(v_new_json->>'branch_id', '')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_action := TG_TABLE_NAME || '.create';
  ELSE
    v_old_json := to_jsonb(OLD);
    v_action := TG_TABLE_NAME || '.update';
  END IF;

  INSERT INTO fincore.audit_logs (actor_user_id, action, entity_type, entity_id, branch_id, result, before_payload, after_payload)
  VALUES (
    v_actor,
    v_action,
    TG_TABLE_NAME,
    (v_new_json->>'id'),
    v_branch,
    'success',
    CASE WHEN TG_OP = 'UPDATE' THEN v_old_json ELSE NULL END,
    v_new_json
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fincore.trg_audit_after_write IS 'SECURITY DEFINER, owned by fincore_audit_writer (least-privilege: USAGE on schema fincore + INSERT on audit_logs only, no BYPASSRLS). fn_current_actor_id() call means this trigger itself now ALSO fails closed if the caller has no valid signed actor context — a write attempted without one aborts here, before any audit row (and therefore before the triggering DML) commits.';

CREATE TRIGGER trg_expenses_audit AFTER INSERT OR UPDATE ON fincore.expenses
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_audit_after_write();
CREATE TRIGGER trg_revenue_transactions_audit AFTER INSERT OR UPDATE ON fincore.revenue_transactions
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_audit_after_write();
CREATE TRIGGER trg_budget_lines_audit AFTER INSERT OR UPDATE ON fincore.budget_lines
  FOR EACH ROW EXECUTE FUNCTION fincore.trg_audit_after_write();

-- ============================================================================
-- 10. Actor identity — WORKSTREAM 2
-- ============================================================================
-- Token format: "<key_id>:<base64url(payload)>:<base64url(hmac_sha256(payload,key))>"
-- payload JSON: {"uid": "<user uuid>", "iat": <unix seconds>, "exp": <unix seconds>, "nonce": "<random>"}
--
-- The backend signs this token when it authenticates a request (it holds the
-- HMAC key in its own secret manager, NOT read from this database) and sets
-- it once per transaction:
--   BEGIN;
--   SET LOCAL app.actor_token = '<key_id>:<payload_b64>:<sig_b64>';
--   ... queries ...
--   COMMIT;
-- SET LOCAL is transaction-scoped, so a pooled connection can never leak one
-- request's token into the next. An unsigned `app.current_user_id` GUC is no
-- longer trusted anywhere in this schema — every actor resolution goes
-- through fn_current_actor_id(), which verifies the HMAC signature inside
-- PostgreSQL before trusting anything in the payload.

CREATE OR REPLACE FUNCTION fincore.fn_constant_time_eq(a BYTEA, b BYTEA)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  diff INT := 0;
  i INT;
BEGIN
  IF a IS NULL OR b IS NULL OR octet_length(a) <> octet_length(b) THEN
    RETURN false;
  END IF;
  FOR i IN 0 .. octet_length(a) - 1 LOOP
    diff := diff | (get_byte(a, i) # get_byte(b, i));
  END LOOP;
  RETURN diff = 0;
END;
$$;

COMMENT ON FUNCTION fincore.fn_constant_time_eq IS 'Byte-wise XOR-accumulate comparison (no early return on first mismatch) to reduce, though not perfectly eliminate, timing side-channel leakage when comparing an HMAC signature. Documented residual risk: a single PL/pgSQL loop is not a hardware-grade constant-time primitive; acceptable for V1 given the 256-bit signature space and a trusted, low-latency internal network between backend and database (see docs/DATABASE_ARCHITECTURE.md threat model).';

CREATE OR REPLACE FUNCTION fincore.fn_current_actor_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, fincore
AS $$
DECLARE
  v_token        TEXT;
  v_key_id       UUID;
  v_payload_b64  TEXT;
  v_sig_b64      TEXT;
  v_key          BYTEA;
  v_expected_sig BYTEA;
  v_given_sig    BYTEA;
  v_payload      JSONB;
  v_uid          UUID;
  v_iat          NUMERIC;
  v_exp          NUMERIC;
  v_now          NUMERIC := extract(epoch FROM clock_timestamp());
  v_status       fincore.user_status;
BEGIN
  -- Trusted service identity: the DB ROLE itself is the trust boundary. A
  -- background job connecting as fincore_service can never claim to be an
  -- arbitrary director by passing a UUID — it is ALWAYS mapped to the fixed
  -- seeded system user, full stop.
  IF session_user = 'fincore_service' THEN
    SELECT id INTO v_uid FROM fincore.users WHERE is_system LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'system actor not seeded' USING ERRCODE = 'internal_error';
    END IF;
    RETURN v_uid;
  END IF;

  v_token := NULLIF(current_setting('app.actor_token', true), '');
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'missing actor context: SET LOCAL app.actor_token is required for this operation'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  IF v_token !~ '^[0-9a-fA-F-]{36}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'malformed actor context' USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_key_id      := split_part(v_token, ':', 1)::uuid;
  v_payload_b64 := split_part(v_token, ':', 2);
  v_sig_b64     := split_part(v_token, ':', 3);

  SELECT hmac_key INTO v_key FROM fincore._actor_signing_keys
   WHERE key_id = v_key_id AND is_active AND retired_at IS NULL;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'unknown or retired signing key' USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_expected_sig := hmac(convert_to(v_payload_b64, 'UTF8'), v_key, 'sha256');
  BEGIN
    v_given_sig := decode(translate(v_sig_b64, '-_', '+/') || repeat('=', (4 - length(v_sig_b64) % 4) % 4), 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'malformed actor context signature' USING ERRCODE = 'invalid_authorization_specification';
  END;

  IF NOT fincore.fn_constant_time_eq(v_expected_sig, v_given_sig) THEN
    RAISE EXCEPTION 'invalid actor context signature' USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  BEGIN
    v_payload := convert_from(decode(translate(v_payload_b64, '-_', '+/') || repeat('=', (4 - length(v_payload_b64) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'malformed actor context payload' USING ERRCODE = 'invalid_authorization_specification';
  END;

  v_uid := NULLIF(v_payload->>'uid', '')::uuid;
  v_iat := (v_payload->>'iat')::numeric;
  v_exp := (v_payload->>'exp')::numeric;

  IF v_uid IS NULL OR v_iat IS NULL OR v_exp IS NULL THEN
    RAISE EXCEPTION 'incomplete actor context payload' USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  IF v_exp <= v_now THEN
    RAISE EXCEPTION 'actor context expired' USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  IF v_iat > v_now + 60 THEN
    RAISE EXCEPTION 'actor context issued in the future' USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  SELECT status INTO v_status FROM fincore.users WHERE id = v_uid;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'actor user not found' USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'actor user is not active (status=%)', v_status USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  RETURN v_uid;
END;
$$;

COMMENT ON FUNCTION fincore.fn_current_actor_id IS 'The ONLY source of actor identity in this schema. SECURITY DEFINER, owned by fincore_actor_verifier (the only role with SELECT on fincore._actor_signing_keys). Rejects: missing token, malformed token, unknown/retired key, bad signature, expired/not-yet-valid payload, unknown user, non-active user. See docs/DATABASE_MIGRATION_AND_OPERATIONS.md section 6 for key provisioning/rotation.';

-- RLS-facing wrapper: swallows fn_current_actor_id()''s exception into NULL.
-- This is NOT "swallowing an audit failure" (that rule applies to
-- trg_audit_after_write, which never catches anything) — it is the correct,
-- fail-closed semantic for a SELECT-time RLS predicate: a missing/invalid
-- actor context must make current_user_has_permission() return false (deny),
-- not abort an unrelated read-only query with a hard error.
CREATE OR REPLACE FUNCTION fincore.current_user_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN fincore.fn_current_actor_id();
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

COMMIT;
