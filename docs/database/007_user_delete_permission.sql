-- ============================================================================
-- 007_user_delete_permission.sql
--
-- PHASE 35: dedicated permission for the guarded hard-delete endpoint.
-- This migration changes permission reference data only. It adds no cascade,
-- does not detach historical rows, and grants the capability only to the
-- active Director role.
--
-- Data-only and idempotent: safe to re-run after 001 -> 006.
-- ============================================================================

BEGIN;

INSERT INTO fincore.permissions (code, category, description)
VALUES (
  'user.delete',
  'user_admin',
  'Tarixiy yoki moliyaviy bog‘liqligi bo‘lmagan foydalanuvchini butunlay o‘chirish'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p ON p.code = 'user.delete'
WHERE r.code = 'director'
  AND r.is_active = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
