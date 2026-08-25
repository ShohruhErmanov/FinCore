import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { AdminRolesService } from './roles.service';

function director(): AuthenticatedUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    fullName: 'Director',
    phone: '+998900000000',
    status: 'active',
    roles: [
      {
        id: '00000000-0000-4000-8000-000000000002',
        role: 'director',
        roleName: 'Direktor',
        branchId: null,
        branchName: null,
      },
    ],
    permissions: ['role.manage', 'user.manage', 'user.deactivate'],
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  };
}

function harness(roleCode: string) {
  const role = { id: '00000000-0000-4000-8000-000000000003', code: roleCode };
  const permissions = [
    { id: '00000000-0000-4000-8000-000000000004', code: 'user.deactivate' },
    { id: '00000000-0000-4000-8000-000000000005', code: 'user.delete' },
  ];
  const deleteMany = vi.fn();
  const createMany = vi.fn();
  const withActor = vi.fn(async (_token: string, work: (tx: unknown) => Promise<unknown>) =>
    work({ role_permissions: { deleteMany, createMany } }),
  );
  const prisma = {
    db: {
      roles: { findUnique: vi.fn().mockResolvedValue(role) },
      permissions: { findMany: vi.fn().mockResolvedValue(permissions) },
    },
    withActor,
  } as unknown as PrismaService;
  const actor = { mint: vi.fn().mockReturnValue('signed-actor-token') } as unknown as ActorContextService;
  return { service: new AdminRolesService(prisma, actor), prisma, withActor };
}

describe('AdminRolesService Director-only user.deactivate policy', () => {
  it.each(['finance_manager', 'cashier'])(
    'does not allow user.deactivate to be assigned to %s',
    async (roleCode) => {
      const test = harness(roleCode);

      await expect(
        test.service.replacePermissions(director(), roleCode, ['user.deactivate']),
      ).rejects.toMatchObject({ code: 'PRIVILEGE_ESCALATION_DENIED' });

      expect(test.withActor).not.toHaveBeenCalled();
    },
  );

  it('allows the permission to remain assigned to Director', async () => {
    const test = harness('director');

    await expect(
      test.service.replacePermissions(director(), 'director', ['user.deactivate']),
    ).resolves.toEqual({ role: 'director', permissions: ['user.deactivate'] });

    expect(test.withActor).toHaveBeenCalledTimes(1);
  });
});

describe('AdminRolesService Director-only user.delete policy', () => {
  it.each(['finance_manager', 'cashier'])(
    'does not allow user.delete to be assigned to %s',
    async (roleCode) => {
      const test = harness(roleCode);

      await expect(
        test.service.replacePermissions(director(), roleCode, ['user.delete']),
      ).rejects.toMatchObject({ code: 'PRIVILEGE_ESCALATION_DENIED' });

      expect(test.withActor).not.toHaveBeenCalled();
    },
  );

  it('allows user.delete to remain assigned to Director', async () => {
    const test = harness('director');

    await expect(
      test.service.replacePermissions(director(), 'director', ['user.delete']),
    ).resolves.toEqual({ role: 'director', permissions: ['user.delete'] });

    expect(test.withActor).toHaveBeenCalledOnce();
  });
});
