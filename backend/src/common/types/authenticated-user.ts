import type { Request } from 'express';

/**
 * Mirrors the frontend's AuthenticatedUser (src/shared/types/domain.ts:49).
 * Field names and nullability must stay identical — the client validates the
 * payload before any component sees it.
 */
export type UserStatus = 'active' | 'inactive' | 'blocked';

export interface RoleAssignment {
  id: string;
  role: string;
  roleName: string;
  branchId: string | null;
  branchName: string | null;
}

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  phone: string;
  status: UserStatus;
  roles: RoleAssignment[];
  permissions: string[];
  /** Branches the user may read. */
  branchScopes: string[];
  /** Branches the user may write to — always a subset of branchScopes. */
  writeBranchScopes: string[];
  fixedSalaryUzs: string;
  lastLoginAt: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
}
