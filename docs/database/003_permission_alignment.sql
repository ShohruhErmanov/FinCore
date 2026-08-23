-- ---------------------------------------------------------------------------
-- 003_permission_alignment.sql
--
-- Aligns fincore.permissions with the permission vocabulary the application
-- actually checks.
--
-- 002_seed_reference.sql seeded the Phase 16 design (29 codes, full approval
-- workflow). The frontend was later reshaped twice — first trimmed to match the
-- office Excel, then extended when revenue, notifications and the cashier report
-- were added — and ended up on a 20-code vocabulary. Twelve codes overlap; eight
-- that the UI requires were never seeded, most importantly `dashboard.view`,
-- which left every authenticated user staring at "Ruxsat yo'q".
--
-- The role -> permission matrix below is copied verbatim from the application's
-- own declaration in src/features/admin/roles-page.tsx (initialRolePermissions).
-- Nothing here is invented.
--
-- SAFETY
--   * DATA ONLY — no DDL. No table, column, constraint or type is touched.
--   * ADDITIVE ONLY — every statement is ON CONFLICT DO NOTHING. No row is
--     updated or deleted, and no existing grant is revoked. The 17 workflow
--     codes from 002 stay in place, simply unused by the current UI.
--   * IDEMPOTENT — safe to run repeatedly.
--   * 001 and 002 remain the authoritative base; this file only adds to them.
-- ---------------------------------------------------------------------------

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The eight codes the UI checks but 002 never seeded
-- ----------------------------------------------------------------------------

INSERT INTO fincore.permissions (code, category, description) VALUES
  ('dashboard.view',               'reports',    'Bosh sahifa (dashboard) ko''rish'),
  ('revenue.view_own_branch',      'revenue',    'O''z filiali tushumlarini ko''rish'),
  ('revenue.view_all_branches',    'revenue',    'Barcha filiallar tushumlarini ko''rish'),
  ('revenue.edit',                 'revenue',    'Tushum yozuvini tahrirlash'),
  ('revenue_plan.manage',          'revenue',    'Oylik tushum rejasini boshqarish'),
  ('notification.manage',          'reports',    'Telegram bildirishnomalarini boshqarish'),
  ('reports.view_cashiers',        'reports',    'Kassirlar hisobotini ko''rish'),
  ('reports.view_own_performance', 'reports',    'O''z natijalari hisobotini ko''rish')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Role grants — src/features/admin/roles-page.tsx:67-113
--
--    Only missing grants are inserted; existing ones are left exactly as they
--    are. This adds capability, it never takes any away.
-- ----------------------------------------------------------------------------

INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  -- Kassir: operatsion, faqat o'z filiali
  ('cashier',         'dashboard.view'),
  ('cashier',         'expense.view_own_branch'),
  ('cashier',         'expense.create'),
  ('cashier',         'revenue.view_own_branch'),
  ('cashier',         'revenue.create'),
  ('cashier',         'reports.view'),
  ('cashier',         'reports.view_own_performance'),

  -- Moliya rahbari: rejalashtirish + Sayxun operatsiyalari
  ('finance_manager', 'dashboard.view'),
  ('finance_manager', 'expense.view_own_branch'),
  ('finance_manager', 'expense.view_all_branches'),
  ('finance_manager', 'expense.create'),
  ('finance_manager', 'expense.edit'),
  ('finance_manager', 'budget.view'),
  ('finance_manager', 'budget.create_edit'),
  ('finance_manager', 'revenue.view_own_branch'),
  ('finance_manager', 'revenue.view_all_branches'),
  ('finance_manager', 'revenue.create'),
  ('finance_manager', 'revenue.edit'),
  ('finance_manager', 'revenue_plan.manage'),
  ('finance_manager', 'import.run'),
  ('finance_manager', 'notification.manage'),
  ('finance_manager', 'reports.view'),
  ('finance_manager', 'reports.view_cashiers'),
  ('finance_manager', 'master_data.manage'),

  -- Direktor: nazorat va rejalashtirish; kunlik xarajat/tushum kiritmaydi
  ('director',        'dashboard.view'),
  ('director',        'expense.view_own_branch'),
  ('director',        'expense.view_all_branches'),
  ('director',        'budget.view'),
  ('director',        'budget.create_edit'),
  ('director',        'revenue.view_own_branch'),
  ('director',        'revenue.view_all_branches'),
  ('director',        'revenue_plan.manage'),
  ('director',        'import.run'),
  ('director',        'notification.manage'),
  ('director',        'reports.view'),
  ('director',        'reports.view_cashiers'),
  ('director',        'master_data.manage'),
  ('director',        'user.manage'),
  ('director',        'role.manage')
) AS grant_list(role_code, permission_code)
JOIN fincore.roles       r ON r.code = grant_list.role_code
JOIN fincore.permissions p ON p.code = grant_list.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
