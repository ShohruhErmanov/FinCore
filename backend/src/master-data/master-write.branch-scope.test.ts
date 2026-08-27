import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { MasterWriteService } from './master-write.service';

const NEW_BRANCH = '00000000-0000-4000-8000-0000000000b0';
const DIRECTOR_ROLE = '00000000-0000-4000-8000-0000000000d1';
const MANAGER_ROLE = '00000000-0000-4000-8000-0000000000d2';

function user(branchIds: Array<string | null>, role = 'director'): AuthenticatedUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    fullName: 'Direktor',
    phone: '+998900000000',
    status: 'active',
    roles: branchIds.map((branchId, index) => ({
      id: `assignment-${index}`,
      role,
      roleName: role,
      branchId,
      branchName: branchId ? 'Filial' : null,
    })),
    permissions: ['master_data.manage'],
    branchScopes: branchIds.filter((id): id is string => id !== null),
    writeBranchScopes: branchIds.filter((id): id is string => id !== null),
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  };
}

function harness(managingRoleIds: string[]) {
  const createUserRole = vi.fn().mockResolvedValue({});
  const findManyUserRoles = vi
    .fn()
    .mockResolvedValue(managingRoleIds.map((role_id) => ({ role_id })));
  const tx = {
    branches: {
      create: vi.fn().mockResolvedValue({
        id: NEW_BRANCH,
        code: 'CHILONZOR',
        name: 'Chilonzor filiali',
        is_active: true,
      }),
    },
    user_roles: { findMany: findManyUserRoles, create: createUserRole },
  };
  const prisma = {
    db: { branches: { count: vi.fn().mockResolvedValue(0) } },
    withActor: vi.fn(async (_token: string, work: (t: unknown) => Promise<unknown>) => work(tx)),
  } as unknown as PrismaService;
  const actor = { mint: vi.fn().mockReturnValue('token') } as unknown as ActorContextService;
  return { service: new MasterWriteService(prisma, actor), createUserRole, findManyUserRoles, tx };
}

describe('MasterWriteService branch creation scope grant', () => {
  const input = { code: 'chilonzor', name: 'Chilonzor filiali' };

  it('grants the new branch back to a creator whose write scope is enumerated', async () => {
    const test = harness([DIRECTOR_ROLE]);

    const created = await test.service.create(user(['branch-a', 'branch-b']), 'branches', input);

    expect(created.id).toBe(NEW_BRANCH);
    expect(test.createUserRole).toHaveBeenCalledWith({
      data: {
        user_id: '00000000-0000-4000-8000-000000000001',
        role_id: DIRECTOR_ROLE,
        branch_id: NEW_BRANCH,
        granted_by: '00000000-0000-4000-8000-000000000001',
      },
    });
  });

  it('writes no grant for a director who already holds company-wide write', async () => {
    const test = harness([DIRECTOR_ROLE]);

    await test.service.create(user([null]), 'branches', input);

    expect(test.findManyUserRoles).not.toHaveBeenCalled();
    expect(test.createUserRole).not.toHaveBeenCalled();
  });

  it('does not treat an all-branch reader as company-wide write', async () => {
    const test = harness([MANAGER_ROLE]);

    await test.service.create(user([null], 'finance_manager'), 'branches', input);

    expect(test.createUserRole).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role_id: MANAGER_ROLE }) }),
    );
  });

  it('grants exactly one role even when the creator holds several', async () => {
    const test = harness([DIRECTOR_ROLE, MANAGER_ROLE]);

    await test.service.create(user(['branch-a'], 'director'), 'branches', input);

    expect(test.createUserRole).toHaveBeenCalledTimes(1);
    expect(test.findManyUserRoles).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: ['role_id'], orderBy: { role: { code: 'asc' } } }),
    );
  });

  it('creates the branch even when no role carries the permission to grant back', async () => {
    const test = harness([]);

    const created = await test.service.create(user(['branch-a']), 'branches', input);

    expect(created.code).toBe('CHILONZOR');
    expect(test.createUserRole).not.toHaveBeenCalled();
  });

  it('leaves the other master-data kinds untouched', async () => {
    const test = harness([DIRECTOR_ROLE]);
    (test.tx as Record<string, unknown>).departments = {
      create: vi.fn().mockResolvedValue({ id: 'd1', code: 'IT', name: 'IT', is_active: true }),
    };
    const prismaCount = vi.fn().mockResolvedValue(0);
    Object.assign(
      (test.service as unknown as { prisma: { db: Record<string, unknown> } }).prisma.db,
      { departments: { count: prismaCount } },
    );

    await test.service.create(user(['branch-a']), 'departments', { code: 'it', name: 'IT' });

    expect(test.createUserRole).not.toHaveBeenCalled();
  });
});
