import { describe, expect, it, vi } from 'vitest';
import type { AuthService, SessionService } from '@/auth';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { AdminUsersService } from './users.service';

const OWNER_ID = '00000000-0000-4000-8000-0000000000b0';

function director(): AuthenticatedUser {
  return {
    id: '00000000-0000-4000-8000-0000000000d0',
    fullName: 'Direktor',
    phone: '+998900000000',
    status: 'active',
    roles: [
      {
        id: 'director-role',
        role: 'director',
        roleName: 'Direktor',
        branchId: null,
        branchName: null,
      },
    ],
    permissions: ['user.deactivate'],
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  };
}

function harness(otherOwners: number) {
  const update = vi.fn().mockResolvedValue({ id: OWNER_ID });
  const tx = {
    users: { count: vi.fn().mockResolvedValue(otherOwners), update },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    db: {
      users: {
        findUnique: vi.fn().mockResolvedValue({
          id: OWNER_ID,
          status: 'active',
          is_system: false,
          user_roles: [{ role: { code: 'business_owner', is_active: true } }],
        }),
      },
    },
    withActor: vi.fn(async (_token: string, work: (value: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  } as unknown as PrismaService;
  const auth = {
    getAuthenticatedUser: vi.fn().mockResolvedValue({ id: OWNER_ID }),
  } as unknown as AuthService;
  const service = new AdminUsersService(
    prisma,
    { mint: vi.fn().mockReturnValue('actor-token') } as unknown as ActorContextService,
    auth,
    { destroyAllForUser: vi.fn() } as unknown as SessionService,
  );
  return { service, update };
}

describe('Business Owner lifecycle safety', () => {
  it('does not deactivate the last active Business Owner', async () => {
    const { service, update } = harness(0);

    await expect(
      service.updateStatus(director(), OWNER_ID, { status: 'inactive' }),
    ).rejects.toMatchObject({ code: 'LAST_BUSINESS_OWNER_REQUIRED', status: 409 });
    expect(update).not.toHaveBeenCalled();
  });

  it('allows deactivation when another active Business Owner remains', async () => {
    const { service, update } = harness(1);

    await expect(
      service.updateStatus(director(), OWNER_ID, { status: 'inactive' }),
    ).resolves.toMatchObject({ id: OWNER_ID });
    expect(update).toHaveBeenCalledOnce();
  });
});
