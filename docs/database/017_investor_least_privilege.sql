-- ============================================================================
-- FINCORE — 017_investor_least_privilege.sql
--
-- Returns the investor role to the capability set 014 and 016 defined for it.
--
-- WHY THIS EXISTS
-- ---------------
-- No migration ever granted an investor anything beyond investor.view_own (014)
-- and investor.settlement.request (016). Four further grants reached the live
-- database through the Rollar screen, which replaces a role's whole permission
-- set on save:
--
--   dashboard.view                -> /reports/dashboard, /reports/expense-plan,
--                                    /reports/expense-analytics
--   revenue.view_own_branch       -> the daily revenue ledger
--   revenue.view_all_branches     -> the same ledger, every branch
--   reports.view_own_performance  -> the cashier performance report
--
-- Together those let an investor read every branch's revenue transactions and
-- the company's expense analytics. An investor is entitled to their share of
-- revenue, not to the ledger the share is computed from, so the grants are
-- removed here.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
--   * it does not drop the permissions — cashier, finance_manager and director
--     all hold them, and deleting the rows would break those roles;
--   * it does not touch any other role's grants;
--   * it does not change investor.view_own or investor.settlement.request;
--   * it does not touch roles.allows_branchless_scope, which is what gives a
--     company-wide investor their read scope. The profit-share calculation
--     depends on that flag and on investor_profiles.branch_id — never on a
--     revenue permission — so removing the grants below cannot change a single
--     figure the investor sees.
--
-- REVERSIBILITY
-- -------------
-- Nothing is destroyed: these are grant rows, and a director can restore any of
-- them from the Rollar screen. The rollback is the mirror of section 1 —
-- INSERT ... SELECT the same four codes for r.code = 'investor'.
--
-- Forward-only and idempotent after 001 -> 016.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Remove the four grants from the investor role, and only from it
-- ----------------------------------------------------------------------------

DELETE FROM fincore.role_permissions rp
USING fincore.roles r, fincore.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'investor'
  AND p.code IN (
    'dashboard.view',
    'revenue.view_own_branch',
    'revenue.view_all_branches',
    'reports.view_own_performance'
  );

-- ----------------------------------------------------------------------------
-- 2. Make sure the two the investor SHOULD hold are present
-- ----------------------------------------------------------------------------
--
-- 014 and 016 already grant these; re-asserting them here means a database
-- where someone saved the Rollar screen with the boxes cleared is repaired by
-- the same migration that trims the excess.

INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p ON p.code IN ('investor.view_own', 'investor.settlement.request')
WHERE r.code = 'investor' AND r.is_active = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Fail loudly if the result is not exactly the intended set
-- ----------------------------------------------------------------------------
--
-- A silent no-op is the failure mode that matters here: this migration's whole
-- job is the final state, so it asserts that state rather than trusting the
-- statements above to have matched anything.

DO $$
DECLARE
  v_actual TEXT;
BEGIN
  SELECT COALESCE(string_agg(p.code, ', ' ORDER BY p.code), '')
    INTO v_actual
  FROM fincore.roles r
  JOIN fincore.role_permissions rp ON rp.role_id = r.id
  JOIN fincore.permissions p ON p.id = rp.permission_id
  WHERE r.code = 'investor';

  IF v_actual <> 'investor.settlement.request, investor.view_own' THEN
    RAISE EXCEPTION
      'investor role must hold exactly investor.settlement.request and investor.view_own, found: %',
      v_actual;
  END IF;
END
$$;

COMMIT;
