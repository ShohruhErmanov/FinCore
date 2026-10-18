-- ============================================================================
-- FINCORE — 018_0_finance_manager_report_permissions.sql
--
-- Gives the finance manager the two cashier-report permissions that 018
-- expects them to hold, and runs just before it (the name sorts after 017 and
-- ahead of 018_director_…).
--
-- WHY
-- ---
-- 003 granted reports.view_own_performance to the cashier only, and
-- reports.view_cashiers to the director only. The finance manager received
-- both later through the Rollar screen, so the production database has them
-- while the migration files never said so. 018 then asserts that
-- reports.view_own_performance is held by exactly "cashier, finance_manager" —
-- true in production, false in a database built from these files alone, where
-- 018 stopped with an exception. This file writes that state down.
--
-- The intended state is the one 018 documents: "The finance manager keeps
-- both: they may read everyone AND have a row of their own worth looking at."
--
-- SAFETY
-- ------
--   * ADDITIVE ONLY — ON CONFLICT DO NOTHING. On the production database both
--     grants already exist, so this changes nothing there.
--   * no permission, role, table or business row is created or removed.
--
-- Forward-only and idempotent after 001 -> 017.
-- ============================================================================

BEGIN;

INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p
  ON p.code IN ('reports.view_cashiers', 'reports.view_own_performance')
WHERE r.code = 'finance_manager' AND r.is_active = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

DO $$
DECLARE
  v_actual TEXT;
BEGIN
  SELECT COALESCE(string_agg(p.code, ', ' ORDER BY p.code), '')
    INTO v_actual
  FROM fincore.roles r
  JOIN fincore.role_permissions rp ON rp.role_id = r.id
  JOIN fincore.permissions p ON p.id = rp.permission_id
  WHERE r.code = 'finance_manager'
    AND p.code IN ('reports.view_cashiers', 'reports.view_own_performance');

  IF v_actual <> 'reports.view_cashiers, reports.view_own_performance' THEN
    RAISE EXCEPTION
      'finance_manager must hold both cashier-report permissions, found: %',
      v_actual;
  END IF;
END
$$;

COMMIT;
