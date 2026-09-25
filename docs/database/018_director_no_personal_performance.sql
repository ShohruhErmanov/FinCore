-- ============================================================================
-- FINCORE — 018_director_no_personal_performance.sql
--
-- Takes reports.view_own_performance off the director role.
--
-- WHY
-- ---
-- The two report permissions describe two different readers:
--
--   reports.view_cashiers         -> sees every cashier's row, their own included
--   reports.view_own_performance  -> sees exactly one row, their own
--
-- A director holds the first, so the second adds nothing they cannot already
-- see. What it did add was a second navigation entry, "Mening natijam", beside
-- "Kassirlar" — a personal-performance screen for somebody who does not collect
-- revenue. It is removed so the director's sidebar says what the role is.
--
-- The finance manager keeps both: they may read everyone AND have a row of
-- their own worth looking at on its own. The cashier keeps only the second.
--
-- SAFETY
-- ------
--   * one grant row is removed, from one role;
--   * the permission itself stays — cashier and finance_manager hold it;
--   * reports.view_cashiers is untouched, and the cashier report route accepts
--     either permission (OR), so the director keeps "Kassirlar" exactly as it
--     was;
--   * no other role, table or business row is touched.
--
-- REVERSIBILITY
-- -------------
-- Nothing is destroyed. To restore it:
--   INSERT INTO fincore.role_permissions (role_id, permission_id)
--   SELECT r.id, p.id FROM fincore.roles r
--   JOIN fincore.permissions p ON p.code = 'reports.view_own_performance'
--   WHERE r.code = 'director'
--   ON CONFLICT DO NOTHING;
--
-- Forward-only and idempotent after 001 -> 017.
-- ============================================================================

BEGIN;

DELETE FROM fincore.role_permissions rp
USING fincore.roles r, fincore.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'director'
  AND p.code = 'reports.view_own_performance';

-- ----------------------------------------------------------------------------
-- Assert the outcome rather than trusting the statement to have matched
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_director_sees_cashiers BOOLEAN;
  v_director_sees_own BOOLEAN;
  v_others TEXT;
BEGIN
  SELECT
    bool_or(p.code = 'reports.view_cashiers'),
    COALESCE(bool_or(p.code = 'reports.view_own_performance'), false)
  INTO v_director_sees_cashiers, v_director_sees_own
  FROM fincore.roles r
  JOIN fincore.role_permissions rp ON rp.role_id = r.id
  JOIN fincore.permissions p ON p.id = rp.permission_id
  WHERE r.code = 'director';

  IF NOT COALESCE(v_director_sees_cashiers, false) THEN
    RAISE EXCEPTION 'director must keep reports.view_cashiers';
  END IF;
  IF v_director_sees_own THEN
    RAISE EXCEPTION 'director still holds reports.view_own_performance';
  END IF;

  -- The roles that should still hold it must still hold it.
  SELECT string_agg(r.code, ', ' ORDER BY r.code)
    INTO v_others
  FROM fincore.roles r
  JOIN fincore.role_permissions rp ON rp.role_id = r.id
  JOIN fincore.permissions p ON p.id = rp.permission_id
  WHERE p.code = 'reports.view_own_performance';

  IF v_others IS DISTINCT FROM 'cashier, finance_manager' THEN
    RAISE EXCEPTION
      'reports.view_own_performance should remain with cashier and finance_manager, found: %',
      COALESCE(v_others, '(none)');
  END IF;
END
$$;

COMMIT;
