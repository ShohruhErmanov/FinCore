-- ============================================================================
-- FINCORE — 020_business_owner_role.sql
--
-- Adds the strategic, company-wide READ role. It deliberately receives no
-- transaction, planning, settlement-decision, user, role or master-data write
-- permission. Scope and capability remain separate: all branches are readable,
-- while AuthService's GLOBAL_WRITE_ROLE_CODES continues to contain Director only.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fincore.roles WHERE code = 'business_owner') THEN
    RAISE EXCEPTION 'business_owner role already exists; 020 must be applied exactly once';
  END IF;
END;
$$;

INSERT INTO fincore.roles (
  code,
  name,
  is_active,
  allows_all_branch_scope,
  allows_branchless_scope
) VALUES (
  'business_owner',
  'Biznes egasi',
  true,
  true,
  false
);

-- Every permission below already exists in the canonical catalog. In
-- particular, investor.view_all is the read capability for both investor
-- details and the payout queue; approve/pay stay separate and are not granted.
INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p ON p.code IN (
  'dashboard.view',
  'expense.view_own_branch',
  'expense.view_all_branches',
  'budget.view',
  'revenue.view_own_branch',
  'revenue.view_all_branches',
  'reports.view',
  'investor.view_all',
  'audit.view'
)
WHERE r.code = 'business_owner';

-- Fail closed if an expected read code was absent, a scope flag drifted, or a
-- future edit accidentally added any capability outside the approved set.
DO $$
DECLARE
  v_role_id UUID;
  v_all_branch BOOLEAN;
  v_branchless BOOLEAN;
  v_grants TEXT[];
  v_expected CONSTANT TEXT[] := ARRAY[
    'audit.view',
    'budget.view',
    'dashboard.view',
    'expense.view_all_branches',
    'expense.view_own_branch',
    'investor.view_all',
    'reports.view',
    'revenue.view_all_branches',
    'revenue.view_own_branch'
  ];
BEGIN
  SELECT id, allows_all_branch_scope, allows_branchless_scope
    INTO v_role_id, v_all_branch, v_branchless
  FROM fincore.roles
  WHERE code = 'business_owner' AND name = 'Biznes egasi' AND is_active;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION '020 self-check: active business_owner role missing';
  END IF;
  IF v_all_branch IS DISTINCT FROM true OR v_branchless IS DISTINCT FROM false THEN
    RAISE EXCEPTION '020 self-check: business_owner scope flags are invalid';
  END IF;

  SELECT array_agg(p.code ORDER BY p.code)
    INTO v_grants
  FROM fincore.role_permissions rp
  JOIN fincore.permissions p ON p.id = rp.permission_id
  WHERE rp.role_id = v_role_id;

  IF v_grants IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION '020 self-check: unexpected permission set: %', v_grants;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fincore.role_permissions rp
    JOIN fincore.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_role_id
      AND p.code IN (
        'expense.create', 'expense.edit', 'expense.correct_reverse',
        'budget.create_edit', 'budget.submit', 'budget.approve',
        'revenue.create', 'revenue.edit', 'revenue.reverse', 'revenue.enter_on_behalf',
        'revenue_plan.create_edit', 'revenue_plan.submit', 'revenue_plan.approve',
        'revenue_plan.manage', 'investor.manage', 'investor.settlement.request',
        'investor.settlement.approve', 'investor.settlement.pay',
        'user.manage', 'user.deactivate', 'user.delete', 'role.manage',
        'master_data.manage', 'period.close', 'period.reopen', 'import.run',
        'import.resolve_exception', 'notification.manage'
      )
  ) THEN
    RAISE EXCEPTION '020 self-check: business_owner has a forbidden mutation permission';
  END IF;
END;
$$;

COMMIT;
