import { ApiException } from '../errors/api-exception';
import type { AuthenticatedUser } from '../types/authenticated-user';

/*
 * In-service permission checks, for what @RequirePermissions cannot say: the
 * guard demands every code it lists, while some routes accept any one of
 * several, or can only decide after loading a record. Both answer with the
 * guard's own 403 body, so the client sees one contract.
 */

export function requirePermission(user: AuthenticatedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw ApiException.missingPermissions([permission]);
}

export function requireAnyPermission(
  user: AuthenticatedUser,
  permissions: readonly string[],
): void {
  if (!permissions.some((code) => user.permissions.includes(code)))
    throw ApiException.missingPermissions(permissions);
}
