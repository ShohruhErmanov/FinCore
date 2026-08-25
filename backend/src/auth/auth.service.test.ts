import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '@/database';
import { AuthService } from './auth.service';

const BRANCH_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_B = '22222222-2222-4222-8222-222222222222';

interface AssignmentOptions {
  id?: string;
  role: 'cashier' | 'finance_manager' | 'director';
  branchId?: string | null;
  branchActive?: boolean;
  roleActive?: boolean;
  allowsAllBranchScope?: boolean;
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
        : { name: branchId === BRANCH_A ? 'Sayxun' : 'Xalqlar', is_active: options.branchActive ?? true },
    role: {
      code: options.role,
      name: options.role,
      is_active: options.roleActive ?? true,
      allows_all_branch_scope: options.allowsAllBranchScope ?? false,
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
    findMany.mockResolvedValue([
      { id: BRANCH_A },
      { id: BRANCH_B },
    ]);
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
      storedUser([assignment({ role: 'cashier', branchId: BRANCH_A, permissions: ['revenue.create'] })]),
    );

    const user = await service.getAuthenticatedUser('user-id');

    expect(user.branchScopes).toEqual([BRANCH_A]);
    expect(user.writeBranchScopes).toEqual([BRANCH_A]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('excludes inactive explicit branches from write scope', async () => {
    findUnique.mockResolvedValue(
      storedUser([
        assignment({ role: 'cashier', branchId: BRANCH_A, branchActive: false }),
      ]),
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
