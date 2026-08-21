-- ============================================================================
-- FINCORE — 002_seed_reference.sql
-- Reference/master data only: branches, roles, permissions, role_permissions,
-- payment methods, departments, expense categories, category aliases, system
-- settings, and the single reserved system actor.
--
-- Explicitly NOT included here (per deliverable requirement):
--   - demo financial transactions (expenses/revenue_transactions)
--   - hardcoded acceptance-example budget/revenue plans (160m/300m/etc. —
--     those are AC-15..AC-22 TEST FIXTURES, see 004_verification.sql)
--   - real named human user accounts (operational onboarding, not reference
--     data; see docs/DATABASE_MIGRATION_AND_OPERATIONS.md section 5)
--
-- Idempotency: every INSERT is ON CONFLICT DO NOTHING keyed by a natural
-- unique code, so this script may be re-run safely against an already-seeded
-- database without duplicating rows.
-- ============================================================================

BEGIN;
SET search_path TO fincore, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. Reserved system actor (guarantees audit_logs.actor_user_id is never
--    NULL for background-job writes). status='inactive' and a random,
--    unusable password hash so it can never authenticate via the API.
-- ----------------------------------------------------------------------------

INSERT INTO fincore.users (id, full_name, phone, email, password_hash, status, is_system)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'FINCORE tizim jarayoni',
  NULL,
  'system@fincore.local',
  '!disabled!',
  'inactive',
  true
)
ON CONFLICT (email) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Branches — exactly two, per hard scope constraint 1. "Barchasi" is a
--    report filter and is intentionally never inserted here.
-- ----------------------------------------------------------------------------

INSERT INTO fincore.branches (code, name) VALUES
  ('SAYXUN', 'Sayxun'),
  ('XALQLAR_DOSTLIGI', 'Xalqlar do''stligi')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Roles
-- ----------------------------------------------------------------------------

INSERT INTO fincore.roles (code, name, allows_all_branch_scope) VALUES
  ('cashier',         'Kassir',          false),
  ('finance_manager', 'Moliya rahbari',  true),
  ('director',        'Direktor',        true)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Permission catalog (TZ section 4.1)
-- ----------------------------------------------------------------------------

INSERT INTO fincore.permissions (code, category, description) VALUES
  ('expense.view_own_branch',   'expense',     'O''z filiali xarajatlarini ko''rish'),
  ('expense.view_all_branches', 'expense',     'Boshqa filial xom tranzaksiyalarini ko''rish'),
  ('expense.create',            'expense',     'Xarajat yaratish (ochiq davrda)'),
  ('expense.edit',              'expense',     'Xarajatni tahrirlash (ochiq davrda)'),
  ('expense.correct_reverse',   'expense',     'Xarajatni reversal qilish'),
  ('expense.submit',            'expense',     'Xarajatni tasdiqqa yuborish (approval yoqilganda)'),
  ('expense.approve',           'expense',     'Xarajatni tasdiqlash (approval yoqilganda)'),
  ('expense.reject',            'expense',     'Xarajatni rad etish (approval yoqilganda)'),
  ('budget.view',               'budget',      'Budjetni ko''rish'),
  ('budget.create_edit',        'budget',      'Budjet versiyasi va satrlarini yaratish/tahrirlash'),
  ('budget.submit',             'budget',      'Budjetni tasdiqqa yuborish'),
  ('budget.approve',            'budget',      'Budjetni yakuniy tasdiqlash'),
  ('revenue.create',            'revenue',     'Tushum tranzaksiyasi kiritish'),
  ('revenue.view_own',          'revenue',     'O''z kassirlik tushumlarini ko''rish'),
  ('revenue.view_all',          'revenue',     'Barcha kassirlar kesimidagi tushum hisoboti'),
  ('revenue.reverse',           'revenue',     'Tushumni reversal qilish'),
  ('revenue.enter_on_behalf',   'revenue',     'Boshqa kassir nomidan tushum kiritish (sabab majburiy)'),
  ('revenue_plan.create_edit',  'revenue',     'Filial tushum rejasini yaratish/tahrirlash'),
  ('revenue_plan.submit',       'revenue',     'Tushum rejasini tasdiqqa yuborish'),
  ('revenue_plan.approve',      'revenue',     'Tushum rejasini yakuniy tasdiqlash'),
  ('reports.view',              'reports',     'Hisobot va dashboard ko''rish'),
  ('period.close',              'period',      'Davrni yopish'),
  ('period.reopen',             'period',      'Davrni qayta ochish'),
  ('master_data.manage',        'master_data', 'Kategoriya, bo''lim, to''lov usulini boshqarish'),
  ('import.run',                'import',      'Migration/import ishga tushirish'),
  ('import.resolve_exception',  'import',      'Import exceptionlarini hal qilish'),
  ('audit.view',                'audit',       'Audit logni ko''rish'),
  ('user.manage',               'user_admin',  'User boshqaruvi'),
  ('role.manage',               'user_admin',  'Rol va ruxsatlar boshqaruvi')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Role -> permission mapping (TZ section 4.1 table)
-- ----------------------------------------------------------------------------
-- cashier: operational-only, single-branch scope enforced via user_roles.branch_id
INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM fincore.roles r, fincore.permissions p
WHERE r.code = 'cashier' AND p.code IN (
  'expense.view_own_branch', 'expense.create', 'expense.edit',
  'reports.view', 'revenue.create', 'revenue.view_own'
)
ON CONFLICT DO NOTHING;

-- finance_manager: cross-branch budget/revenue-plan authority + "ko'rish"
-- (view-only) into other-branch raw transactions. Deliberately EXCLUDES
-- expense.create/edit/correct_reverse and revenue.create/reverse: since this
-- role is granted with branch_id = NULL (see roles.allows_all_branch_scope),
-- putting an operational write permission directly on it would give
-- company-wide write access to EVERY branch — contradicting TZ 4.1's
-- explicit "Sayxun kassir scope'ida" restriction. A finance_manager who also
-- needs to create/edit/reverse expenses or revenue gets that ability
-- EXCLUSIVELY through a second, branch-scoped `cashier` user_roles row (see
-- the fixture pattern in 004_verification.sql and DECISION-log entry in
-- DATABASE_ARCHITECTURE.md section 3) — the cashier role below already
-- carries expense.create/edit and revenue.create, scoped to whichever
-- branch that specific user_roles row names.
INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM fincore.roles r, fincore.permissions p
WHERE r.code = 'finance_manager' AND p.code IN (
  'expense.view_own_branch', 'expense.view_all_branches',
  'master_data.manage',
  'budget.view', 'budget.create_edit', 'budget.submit',
  'reports.view',
  'revenue.view_own', 'revenue.view_all', 'revenue.enter_on_behalf',
  'revenue_plan.create_edit', 'revenue_plan.submit',
  'audit.view', 'import.run', 'import.resolve_exception'
)
ON CONFLICT DO NOTHING;

-- director: full authority, all branches, all permissions.
INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM fincore.roles r, fincore.permissions p
WHERE r.code = 'director'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Payment methods (TZ section 3.3)
-- ----------------------------------------------------------------------------

INSERT INTO fincore.payment_methods (code, name, sort_order) VALUES
  ('CASH',            'Naqd pul',                        1),
  ('BANK_TRANSFER',   'Bank o''tkazmasi',                 2),
  ('CARD',            'Plastik karta (Uzcard/Humo)',      3),
  ('CLICK_PAYME',     'Click/Payme',                      4),
  ('CORPORATE_CARD',  'Korporativ karta',                 5),
  ('OTHER',           'Boshqa',                           6)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. Departments (TZ section 3.3)
-- ----------------------------------------------------------------------------

INSERT INTO fincore.departments (code, name) VALUES
  ('ADMIN',        'Ma''muriyat'),
  ('EDUCATION',    'O''quv bo''limi'),
  ('MARKETING',    'Marketing'),
  ('SALES',        'Sotuv (ROP)'),
  ('TECH_SUPPORT', 'Texnik ta''minot'),
  ('HR',           'HR'),
  ('GENERAL',      'Umumiy')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. Expense categories — 25 confirmed rows (TZ section 3.2): 10 fixed,
--    15 variable. expense_type is immutable business meaning, never
--    user-editable per instance (FR-MD-02, BR-05, BR-10).
-- ----------------------------------------------------------------------------

INSERT INTO fincore.expense_categories (code, name, expense_type, sort_order) VALUES
  -- Doimiy / fixed (10)
  ('RENT',                 'Ijara',                                  'fixed', 10),
  ('STAFF_SALARY',         'Xodimlar oyligi',                        'fixed', 20),
  ('TAX_SOCIAL',           'Soliq va ijtimoiy to''lovlar',            'fixed', 30),
  ('INTERNET_COMM',        'Internet/aloqa',                         'fixed', 40),
  ('UTILITY',              'Kommunal abonent to''lovi',               'fixed', 50),
  ('SOFTWARE_LICENSE',     'Dasturiy ta''minot/litsenziya',           'fixed', 60),
  ('ACCOUNTING',           'Buxgalteriya',                           'fixed', 70),
  ('SECURITY_GUARD',       'Qo''riqlash',                             'fixed', 80),
  ('TERMINAL_SERVER_SMS',  'Terminal, server, SMS',                  'fixed', 90),
  ('CLEANING',             'Tozalash',                               'fixed', 100),
  -- O'zgaruvchan / variable (15)
  ('MENTOR_SALARY',        'Mentorlar oyligi',                       'variable', 110),
  ('KPI_BONUS',            'KPI/bonus',                              'variable', 120),
  ('MARKETING_EXPENSE',    'Marketing',                              'variable', 130),
  ('PRINTING',             'Poligrafiya',                            'variable', 140),
  ('STATIONERY',           'Kanselyariya/o''quv materiallari',        'variable', 150),
  ('ELECTRICITY',          'Elektr',                                 'variable', 160),
  ('EQUIPMENT_PURCHASE',   'Texnika xaridi',                         'variable', 170),
  ('EQUIPMENT_REPAIR',     'Texnika ta''miri',                        'variable', 180),
  ('EVENT',                'Tadbir',                                 'variable', 190),
  ('HOSPITALITY',          'Mehmondorchilik',                        'variable', 200),
  ('TRANSPORT',            'Transport',                              'variable', 210),
  ('TRAINING',             'Malaka oshirish',                        'variable', 220),
  ('TEAM_BUILDING_HR',     'Team-building/HR',                       'variable', 230),
  ('OTHER_EXPENSES',       'Boshqa xarajatlar',                      'variable', 240),
  ('GAMIFICATION',         'Gamifikatsiya',                          'variable', 250)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. Category aliases — known Sheets-era spelling variants that must
--    normalize to one canonical category (DQ-04, Ilova A). These do not
--    change fact-table linkage; they only steer import mapping.
-- ----------------------------------------------------------------------------

INSERT INTO fincore.category_aliases (category_id, alias_text)
SELECT c.id, a.alias_text
FROM fincore.expense_categories c
JOIN (VALUES
  ('TERMINAL_SERVER_SMS', 'Terminal,server,sms'),
  ('TERMINAL_SERVER_SMS', 'Terminal, server, sms'),
  ('TERMINAL_SERVER_SMS', 'Terminal, server, SMS'),
  ('UTILITY',             'Bank xizmat haqi'),
  ('KPI_BONUS',           'Sovg''a va rag''batlantirish'),
  ('TEAM_BUILDING_HR',    'Team building, HR'),
  ('GAMIFICATION',        'Gaminifikatsiya')
) AS a(category_code, alias_text) ON a.category_code = c.code
ON CONFLICT DO NOTHING;

COMMENT ON TABLE fincore.category_aliases IS 'Rows above trace directly to docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md Ilova A. "Bank xizmat haqi" is mapped to UTILITY as the closest confirmed canonical category pending product-owner confirmation — see Open Decisions in DATABASE_ARCHITECTURE.md.';

-- ----------------------------------------------------------------------------
-- 10. System settings
-- ----------------------------------------------------------------------------

INSERT INTO fincore.system_settings (key, value, description) VALUES
  ('expense_approval_enabled',
   'false',
   'FR-APR: per-expense draft->submitted->approved workflow. OFF by default; new expenses are created directly as approved.'),
  ('expense_attachment_amount_threshold_uzs',
   'null',
   'FR-EXP-06: expenses at or above this amount require an attachment once V1.1 attachments ship. null = no threshold configured yet (product-owner decision pending).'),
  ('revenue_external_reference_duplicate_policy',
   '"unique_per_branch_payment_method"',
   'FR-REV-09: chosen default for the ambiguous "warning OR unique" source requirement — hard partial-unique index per (branch, payment_method) rather than a soft warning. See Open Decisions.'),
  ('period_close_reminder_day_of_month',
   '1',
   'FR-CLOSE-02: day of the following month the close reminder starts firing (1-5 window per TZ; job runs daily in that window).')
ON CONFLICT (key) DO NOTHING;

COMMIT;
