import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Roles whose all-branch (NULL) assignment carries WRITE, not just READ.
 *
 * `roles.allows_all_branch_scope` is deliberately broader — Finance Manager
 * holds it too — so it can never be the write test on its own. Keep this list
 * in sync with the scope derivation in AuthService.getAuthenticatedUser().
 */
export const GLOBAL_WRITE_ROLE_CODES: ReadonlySet<string> = new Set(['director']);

/**
 * True when the user writes to every active branch by policy rather than by
 * enumeration, so their write scope follows the branch table automatically and
 * a newly created branch needs no explicit grant.
 */
export function hasCompanyWideWrite(user: AuthenticatedUser): boolean {
  return user.roles.some(
    (assignment) => assignment.branchId === null && GLOBAL_WRITE_ROLE_CODES.has(assignment.role),
  );
}
