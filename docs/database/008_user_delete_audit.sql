-- ============================================================================
-- 008_user_delete_audit.sql
--
-- PHASE 35: fail-closed actor audit for the narrow, dependency-free users
-- hard-delete exception. The trigger never serializes phone, email or
-- password_hash. Restrictive foreign keys continue to protect every historical
-- and business dependency.
--
-- Idempotent and forward-only: safe to re-run after 001 -> 007.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fincore.trg_users_delete_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, fincore
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := fincore.fn_current_actor_id();

  IF OLD.is_system THEN
    RAISE EXCEPTION 'system user cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_actor = OLD.id THEN
    RAISE EXCEPTION 'self delete is not allowed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;

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
    'users.delete',
    'users',
    OLD.id::text,
    'success',
    jsonb_build_object(
      'status', OLD.status::text,
      'is_system', OLD.is_system
    ),
    NULL
  );

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION fincore.trg_users_delete_audit IS
  'Fail-closed users DELETE audit. Uses signed actor context and stores only target id/status/system flag; authentication secrets and PII are excluded.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore'
      AND c.relname = 'users'
      AND t.tgname = 'trg_users_delete_audit'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_users_delete_audit
      BEFORE DELETE ON fincore.users
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_users_delete_audit()';
  END IF;
END;
$$;

COMMENT ON TABLE fincore.users IS
  'Identity/history anchor. Normal lifecycle uses status deactivation. Permanent deletion is restricted to the authenticated user.delete flow, never self/system, and only when every restrictive historical/business foreign key has zero references.';

COMMIT;
