import { describe, expect, it, vi } from 'vitest';
import type { AuthService, SessionService } from '@/auth';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { AdminUsersService } from './users.service';

const OWNER_ID = '00000000-0000-4000-8000-0000000000b0';

function actorWith(id: string, role: string, roleName: string): AuthenticatedUser {
  return {
    id,
    fullName: roleName,
    phone: '+998900000000',
    status: 'active',
    roles: [{ id: `${role}-role`, role, roleName, branchId: null, branchName: null }],
    permissions: ['user.manage', 'user.deactivate', 'user.delete'],
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  } as AuthenticatedUser;
}

const director = () => actorWith('00000000-0000-4000-8000-0000000000d0', 'director', 'Direktor');
/** A second Business Owner — the only kind of account allowed to manage the first. */
const otherOwner = () =>
  actorWith('00000000-0000-4000-8000-0000000000b1', 'business_owner', 'Biznes egasi');

function harness(otherOwners: number) {
  const update = vi.fn().mockResolvedValue({ id: OWNER_ID });
  const remove = vi.fn().mockResolvedValue({ id: OWNER_ID });
  const createRole = vi.fn().mockResolvedValue({ id: 'grant' });
  const revokeRoles = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    users: { count: vi.fn().mockResolvedValue(otherOwners), update, delete: remove },
    user_roles: { updateMany: revokeRoles, create: createRole },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi
      .fn()
      .mockResolvedValue([
        { status: 'active', is_system: false, is_director: false, is_business_owner: true },
      ]),
  };
  const withActor = vi.fn(async (_token: string, work: (value: typeof tx) => Promise<unknown>) =>
    work(tx),
  );
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
    withActor,
  } as unknown as PrismaService;
  const auth = {
    getAuthenticatedUser: vi.fn().mockResolvedValue({ id: OWNER_ID }),
  } as unknown as AuthService;
  const sessions = { destroyAllForUser: vi.fn() } as unknown as SessionService;
  const service = new AdminUsersService(
    prisma,
    { mint: vi.fn().mockReturnValue('actor-token') } as unknown as ActorContextService,
    auth,
    sessions,
  );
  return { service, update, remove, revokeRoles, withActor, sessions };
}

const PROTECTED = { code: 'BUSINESS_OWNER_PROTECTED', status: 403 };

describe('Business Owner lifecycle safety', () => {
  it('does not deactivate the last active Business Owner', async () => {
    const { service, update } = harness(0);

    await expect(
      service.updateStatus(otherOwner(), OWNER_ID, { status: 'inactive' }),
    ).rejects.toMatchObject({ code: 'LAST_BUSINESS_OWNER_REQUIRED', status: 409 });
    expect(update).not.toHaveBeenCalled();
  });

  it('lets another Business Owner deactivate one while an active one remains', async () => {
    const { service, update } = harness(1);

    await expect(
      service.updateStatus(otherOwner(), OWNER_ID, { status: 'inactive' }),
    ).resolves.toMatchObject({ id: OWNER_ID });
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('a director can do nothing to a Business Owner', () => {
  it('cannot change its status, even with another owner left', async () => {
    const { service, update, withActor } = harness(1);
    await expect(
      service.updateStatus(director(), OWNER_ID, { status: 'inactive' }),
    ).rejects.toMatchObject(PROTECTED);
    expect(withActor).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('cannot change its roles', async () => {
    const { service, revokeRoles, withActor } = harness(1);
    await expect(
      service.updateAccess(director(), OWNER_ID, {
        roles: [{ role: 'cashier', branchId: null }],
      }),
    ).rejects.toMatchObject(PROTECTED);
    expect(withActor).not.toHaveBeenCalled();
    expect(revokeRoles).not.toHaveBeenCalled();
  });

  it('cannot delete it', async () => {
    const { service, remove, sessions } = harness(1);
    await expect(service.deleteUser(director(), OWNER_ID)).rejects.toMatchObject(PROTECTED);
    expect(remove).not.toHaveBeenCalled();
    expect(sessions.destroyAllForUser).not.toHaveBeenCalled();
  });

  it('cannot set its salary', async () => {
    const { service, update, withActor } = harness(1);
    await expect(
      service.updateSalary(director(), OWNER_ID, { fixedSalaryUzs: '1000000' }),
    ).rejects.toMatchObject(PROTECTED);
    expect(withActor).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('cannot reset its password', async () => {
    const { service, update, withActor } = harness(1);
    await expect(
      service.updatePassword(director(), OWNER_ID, {
        password: 'yangi-parol-2026!',
        confirmPassword: 'yangi-parol-2026!',
      }),
    ).rejects.toMatchObject({ code: 'BUSINESS_OWNER_PASSWORD_DENIED', status: 403 });
    expect(withActor).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
