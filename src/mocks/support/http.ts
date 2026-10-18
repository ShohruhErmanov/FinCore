import { HttpResponse, type JsonBodyType } from 'msw';
import type { AuthenticatedUser, PaginatedResponse } from '@/shared/types/domain';
import { db, MOCK_SESSION_KEY } from '../state';

export const ok = <T extends JsonBodyType>(body: T, status = 200) =>
  HttpResponse.json(body, { status });

export const noContent = () => new HttpResponse(null, { status: 204 });

export const problem = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => HttpResponse.json({ code, message, ...(details ? { details } : {}) }, { status });

export function requireUser(): AuthenticatedUser | HttpResponse {
  if (!db.signedInUser) return problem(401, 'UNAUTHENTICATED', 'Sessiya tugagan. Qayta kiring.');
  const current = db.userRows.find((user) => user.id === db.signedInUser?.id);
  if (!current || current.status !== 'active') {
    db.signedInUser = null;
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(MOCK_SESSION_KEY);
    return problem(401, 'ACCOUNT_DISABLED', 'Hisob nofaol yoki bloklangan.');
  }
  return db.signedInUser;
}

export function hasPermission(
  user: AuthenticatedUser,
  permission: AuthenticatedUser['permissions'][number],
): boolean {
  return user.permissions.includes(permission);
}

export function hasAnyPermission(
  user: AuthenticatedUser,
  ...permissions: AuthenticatedUser['permissions']
): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasRole(
  user: AuthenticatedUser,
  role: AuthenticatedUser['roles'][number]['role'],
): boolean {
  return user.roles.some((assignment) => assignment.role === role);
}

export function canUseBranch(user: AuthenticatedUser, branchId: string): boolean {
  return user.branchScopes.includes(branchId);
}

export function canWriteBranch(user: AuthenticatedUser, branchId: string): boolean {
  return user.writeBranchScopes.includes(branchId);
}

/**
 * Mirrors MasterWriteService.grantCreatorBranchScope: whoever creates a branch
 * keeps it. The real backend re-derives scope per request and so only has to
 * fill the enumerated write hole; these scopes are stored snapshots, so both
 * lists are appended here and every copy of the account is kept in step.
 */
export function grantCreatorBranchScope(user: AuthenticatedUser, branchId: string): void {
  const stored = db.userRows.find((row) => row.id === user.id);
  for (const target of new Set([user, db.signedInUser, stored])) {
    if (!target || target.id !== user.id) continue;
    if (!target.branchScopes.includes(branchId))
      target.branchScopes = [...target.branchScopes, branchId];
    if (!target.writeBranchScopes.includes(branchId))
      target.writeBranchScopes = [...target.writeBranchScopes, branchId];
  }
}

export function scopedBranchFilter(
  user: AuthenticatedUser,
  requested: string | null,
): string | null {
  if (!requested || requested === 'all')
    return user.branchScopes.length === 1 ? (user.branchScopes[0] ?? null) : null;
  return requested;
}

function integer(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function paginate<T>(items: T[], request: Request): PaginatedResponse<T> {
  const url = new URL(request.url);
  const page = integer(url.searchParams.get('page'), 1);
  const pageSize = Math.min(integer(url.searchParams.get('pageSize'), 20), 100);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
    nextCursor: start + pageSize < items.length ? String(page + 1) : null,
  };
}
