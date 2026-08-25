-- ============================================================================
-- 006_user_deactivate_permission.sql
--
-- PHASE 33: separate user lifecycle deactivation from broad user management.
-- Users remain soft-deactivated through fincore.users.status; no hard delete,
-- schema change or historical-data rewrite is introduced.
--
-- Data-only and idempotent: safe to re-run after 001 -> 005.
-- ============================================================================

BEGIN;

INSERT INTO fincore.permissions (code, category, description)
VALUES (
  'user.deactivate',
  'user_admin',
  'Foydalanuvchini nofaol yoki bloklangan holatga o‘tkazish va qayta faollashtirish'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p ON p.code = 'user.deactivate'
WHERE r.code = 'director'
  AND r.is_active = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
