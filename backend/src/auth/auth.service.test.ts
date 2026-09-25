import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '@/database';
import { AuthService } from './auth.service';

const BRANCH_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_B = '22222222-2222-4222-8222-222222222222';

interface AssignmentOptions {
  id?: string;
  role: 'cashier' | 'finance_manager' | 'director' | 'investor' | 'business_owner';
  branchId?: string | null;
  branchActive?: boolean;
  roleActive?: boolean;
  allowsAllBranchScope?: boolean;
  allowsBranchlessScope?: boolean;
  permissions?: string[];
}

function assignment(options: AssignmentOptions) {
  const branchId = options.branchId ?? null;
  return {
    id: options.id ?? `${options.role}-${branchId ?? 'global'}`,
    branch_id: branchId,
    branch:
      branchId === null
        ? null
        : {
            name: branchId === BRANCH_A ? 'Sayxun' : 'Xalqlar',
            is_active: options.branchActive ?? true,
          },
    role: {
      code: options.role,
      name: options.role,
      is_active: options.roleActive ?? true,
      allows_all_branch_scope: options.allowsAllBranchScope ?? false,
      allows_branchless_scope: options.allowsBranchlessScope ?? false,
      role_permissions: (options.permissions ?? []).map((code) => ({ permission: { code } })),
    },
  };
}

function storedUser(userRoles: ReturnType<typeof assignment>[]) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    full_name: 'Test User',
    phone: '+998000000000',
    status: 'active',
    fixed_salary_uzs: 0n,
    last_login_at: null,
    user_roles: userRoles,
  };
}

describe('AuthService branch write policy', () => {
  const findUnique = vi.fn();
  const findMany = vi.fn();
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([{ id: BRANCH_A }, { id: BRANCH_B }]);
    service = new AuthService({
      db: {
        users: { findUnique },
        branches: { findMany },
      },
    } as unknown as PrismaService);
  });

  it('gives an active global Director all active branches for write', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({
          role: 'director',
          allowsAllBranchScope: true,
          permissions: ['revenue.create'],
        }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');

    expect(user.writeBranchScopes).toEqual([BRANCH_A, BRANCH_B]);
    expect(user.branchScopes).toEqual([BRANCH_A, BRANCH_B]);
    expect(user.permissions).toContain('revenue.create');
    expect(findMany).toHaveBeenCalledWith({
      where: { is_active: true },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
  });

  it('keeps global-read Finance Manager writes on explicit active branches only', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({
          role: 'finance_manager',
          allowsAllBranchScope: true,
          permissions: ['revenue.create'],
        }),
        assignment({ role: 'cashier', branchId: BRANCH_A, permissions: ['revenue.create'] }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');

    expect(user.branchScopes).toEqual([BRANCH_A, BRANCH_B]);
    expect(user.writeBranchScopes).toEqual([BRANCH_A]);
  });

  it('does not turn global read or a mutation permission into global write', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({
          role: 'finance_manager',
          allowsAllBranchScope: true,
          permissions: ['expense.create'],
        }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');

    expect(user.branchScopes).toEqual([BRANCH_A, BRANCH_B]);
    expect(user.writeBranchScopes).toEqual([]);
  });

  it('keeps a branch-scoped cashier on its assigned active branch', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({ role: 'cashier', branchId: BRANCH_A, permissions: ['revenue.create'] }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');

    expect(user.branchScopes).toEqual([BRANCH_A]);
    expect(user.writeBranchScopes).toEqual([BRANCH_A]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('excludes inactive explicit branches from write scope', async () => {
    findUnique.mockResolvedValue(
      storedUser([assignment({ role: 'cashier', branchId: BRANCH_A, branchActive: false })]),
    );

    const user = await service.getAuthenticatedUser('user-id');

    expect(user.writeBranchScopes).toEqual([]);
  });

  it('requires the eligible Director assignment itself to be global and active', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({ role: 'director', branchId: BRANCH_A, allowsAllBranchScope: true }),
        assignment({
          id: 'inactive-global-director',
          role: 'director',
          roleActive: false,
          allowsAllBranchScope: true,
        }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');

    expect(user.writeBranchScopes).toEqual([BRANCH_A]);
    expect(user.roles).toHaveLength(1);
  });

  it('loads only active, non-revoked assignments from storage', async () => {
    findUnique.mockResolvedValue(storedUser([]));

    await service.getAuthenticatedUser('user-id');

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          user_roles: expect.objectContaining({
            where: { is_active: true, revoked_at: null },
          }),
        }),
      }),
    );
  });
});

/**
 * PHASE 47 — a branchless role (the investor) reads company-wide because it has
 * no branch dimension, but that must never become a write scope.
 */
describe('AuthService branchless scope', () => {
  const findUnique = vi.fn();
  const findMany = vi.fn();
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([{ id: BRANCH_A }, { id: BRANCH_B }]);
    service = new AuthService({
      db: { users: { findUnique }, branches: { findMany } },
    } as unknown as PrismaService);
  });

  it('gives a branchless role company-wide READ and no write scope', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({
          role: 'investor',
          branchId: null,
          allowsBranchlessScope: true,
          permissions: ['investor.view_own'],
        }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');

    expect(user.branchScopes).toEqual([BRANCH_A, BRANCH_B]);
    // The whole point: company-wide READ is not company-wide WRITE.
    expect(user.writeBranchScopes).toEqual([]);
    expect(user.permissions).toEqual(['investor.view_own']);
  });

  it('does not let a branchless role inherit any mutation permission', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({
          role: 'investor',
          branchId: null,
          allowsBranchlessScope: true,
          permissions: ['investor.view_own'],
        }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');
    for (const denied of [
      'expense.create',
      'revenue.create',
      'budget.create_edit',
      'user.manage',
      'investor.manage',
      'investor.view_all',
    ])
      expect(user.permissions).not.toContain(denied);
  });

  it('leaves a role with neither capability branch-scoped', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({ role: 'cashier', branchId: BRANCH_A, permissions: ['expense.create'] }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');
    expect(user.branchScopes).toEqual([BRANCH_A]);
    expect(user.writeBranchScopes).toEqual([BRANCH_A]);
  });

  it('keeps allows_all_branch_scope working on its own', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({
          role: 'finance_manager',
          allowsAllBranchScope: true,
          permissions: ['reports.view'],
        }),
      ]),
    );

    const user = await service.getAuthenticatedUser('user-id');
    expect(user.branchScopes).toEqual([BRANCH_A, BRANCH_B]);
    // finance_manager is not a global writer, so read-all never became write-all.
    expect(user.writeBranchScopes).toEqual([]);
  });
});

describe('AuthService Business Owner scope', () => {
  it('resolves every active branch for read and never creates a write scope', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      storedUser([
        assignment({
          role: 'business_owner',
          allowsAllBranchScope: true,
          permissions: [
            'dashboard.view',
            'expense.view_all_branches',
            'revenue.view_all_branches',
            'budget.view',
            'reports.view',
            'investor.view_all',
            'audit.view',
          ],
        }),
      ]),
    );
    const findMany = vi.fn().mockResolvedValue([{ id: BRANCH_A }, { id: BRANCH_B }]);
    const service = new AuthService({
      db: { users: { findUnique }, branches: { findMany } },
    } as unknown as PrismaService);

    const user = await service.getAuthenticatedUser('owner-id');

    expect(user.branchScopes).toEqual([BRANCH_A, BRANCH_B]);
    expect(user.writeBranchScopes).toEqual([]);
    expect(user.roles[0]).toMatchObject({ role: 'business_owner' });
    for (const denied of [
      'revenue.create',
      'expense.create',
      'budget.create_edit',
      'investor.manage',
      'investor.settlement.approve',
      'investor.settlement.pay',
      'user.manage',
      'role.manage',
    ])
      expect(user.permissions).not.toContain(denied);
  });
});
