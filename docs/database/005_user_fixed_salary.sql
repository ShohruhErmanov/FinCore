-- ============================================================================
-- 005_user_fixed_salary.sql
--
-- PHASE 19 / DECISION 2 (OPTION A): fixed salary lives on fincore.users.
--
-- Additive only. This file adds one column plus a salary-only audit trigger:
-- it creates no table, drops nothing, rewrites no history and touches no
-- financial row.
-- 001/002/003/004 remain exactly as they were applied.
--
-- Why a column on users rather than user_roles or a payroll table:
-- the frontend contract carries fixedSalaryUzs on AuthenticatedUser and
-- PATCH /users/:id/salary sends a single scalar with neither a role nor a
-- branch parameter, so users is the only place the existing contract can
-- actually address. See docs/PHASE_18_9 audit, section 14.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE fincore.users
  ADD COLUMN IF NOT EXISTS fixed_salary_uzs fincore.uzs_amount_nonnegative NOT NULL DEFAULT 0;

COMMENT ON COLUMN fincore.users.fixed_salary_uzs IS
  'Xodimning belgilangan oylik ish haqi (butun so''m). Domen CHECK (VALUE >= 0) manfiy qiymatni rad etadi. Tarix saqlanmaydi — bitta joriy qiymat. Kelajakda tarix kerak bo''lsa user_compensation jadvaliga ko''chiriladi.';

-- The generic trg_audit_after_write serializes a whole row. It must NOT be
-- attached to users because that would copy password_hash into audit_logs.
-- This narrow trigger consumes the same signed actor context while recording
-- only the old/new salary values. Audit failure aborts the salary update.
CREATE OR REPLACE FUNCTION fincore.trg_users_fixed_salary_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, fincore
AS $$
DECLARE
  v_actor UUID;
BEGIN
  IF NEW.fixed_salary_uzs IS NOT DISTINCT FROM OLD.fixed_salary_uzs THEN
    RETURN NEW;
  END IF;

  v_actor := fincore.fn_current_actor_id();

  INSERT INTO fincore.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    result,
    before_payload,
    after_payload
  )
  VALUES (
    v_actor,
    'users.salary.update',
    'users',
    NEW.id::text,
    'success',
    jsonb_build_object('fixed_salary_uzs', OLD.fixed_salary_uzs::bigint::text),
    jsonb_build_object('fixed_salary_uzs', NEW.fixed_salary_uzs::bigint::text)
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fincore.trg_users_fixed_salary_audit IS
  'Salary-only actor audit. Payload intentionally excludes phone, email and password_hash.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore'
      AND c.relname = 'users'
      AND t.tgname = 'trg_users_fixed_salary_audit'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_users_fixed_salary_audit
      AFTER UPDATE OF fixed_salary_uzs ON fincore.users
      FOR EACH ROW
      WHEN (OLD.fixed_salary_uzs IS DISTINCT FROM NEW.fixed_salary_uzs)
      EXECUTE FUNCTION fincore.trg_users_fixed_salary_audit()';
  END IF;
END;
$$;

COMMIT;
