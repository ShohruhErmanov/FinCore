import { describe, expect, it, vi } from 'vitest';
import type { AuthService, SessionService } from '@/auth';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { AdminUsersService } from './users.service';

const ACTOR_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000002';

function authenticatedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: TARGET_ID,
    fullName: 'Safe Cashier',
    phone: '+998901234567',
    status: 'active',
    roles: [],
    permissions: [],
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '4500000',
    lastLoginAt: null,
    ...overrides,
  };
}

function directorActor(id = ACTOR_ID): AuthenticatedUser {
  return authenticatedUser({
    id,
    fullName: 'Director',
    roles: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        role: 'director',
        roleName: 'Direktor',
        branchId: null,
        branchName: null,
      },
    ],
    permissions: ['user.manage', 'user.deactivate', 'user.delete'],
  });
}

function setup() {
  const users = {
    findUnique: vi.fn().mockResolvedValue({
      id: TARGET_ID,
      status: 'active',
      is_system: false,
      user_roles: [{ role: { code: 'cashier', is_active: true } }],
    }),
    count: vi.fn().mockResolvedValue(1),
    update: vi.fn().mockResolvedValue({ id: TARGET_ID }),
    delete: vi.fn().mockResolvedValue({ id: TARGET_ID }),
  };
  const tx = {
    users,
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([
      { status: 'active', is_system: false, is_director: false },
    ]),
  };
  const withActor = vi.fn(
    async (_token: string, work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
  );
  const prisma = {
    // Keep the root client distinct from the transaction client so the
    // last-Director regression fails if its count ever escapes the transaction.
    db: { users: { findUnique: users.findUnique } },
    withActor,
  } as unknown as PrismaService;
  const actor = {
    mint: vi.fn().mockReturnValue('signed-actor-token'),
  } as unknown as ActorContextService;
  const safeProjection = authenticatedUser();
  const auth = {
    getAuthenticatedUser: vi.fn().mockResolvedValue(safeProjection),
  } as unknown as AuthService;
  const sessions = {
    destroyAllForUser: vi.fn(),
  } as unknown as SessionService;

  return {
    service: new AdminUsersService(prisma, actor, auth, sessions),
    users,
    tx,
    withActor,
    actor,
    auth,
    sessions,
    safeProjection,
  };
}

describe('AdminUsersService.updateSalary (PHASE 19)', () => {
  it('writes a valid salary through the actor-aware transaction and returns the safe projection', async () => {
    const { service, users, withActor, actor, auth, safeProjection } = setup();
    const requester = authenticatedUser({ id: ACTOR_ID, fullName: 'Director' });

    const result = await service.updateSalary(requester, TARGET_ID, {
      fixedSalaryUzs: '4500000',
    });

    expect(actor.mint).toHaveBeenCalledWith(ACTOR_ID);
    expect(withActor).toHaveBeenCalledTimes(1);
    expect(withActor).toHaveBeenCalledWith('signed-actor-token', expect.any(Function));
    expect(users.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { fixed_salary_uzs: 4_500_000n },
    });
    expect(auth.getAuthenticatedUser).toHaveBeenCalledWith(TARGET_ID, false);
    expect(result).toEqual(safeProjection);
    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('passwordHash');
    expect(Object.keys(result).sort()).toEqual(
      [
        'branchScopes',
        'fixedSalaryUzs',
        'fullName',
        'id',
        'lastLoginAt',
        'permissions',
        'phone',
        'roles',
        'status',
        'writeBranchScopes',
      ].sort(),
    );
  });

  it('rejects a value above PostgreSQL BIGINT before opening an actor transaction', async () => {
    const { service, users, withActor, actor, auth } = setup();

    await expect(
      service.updateSalary(authenticatedUser({ id: ACTOR_ID }), TARGET_ID, {
        fixedSalaryUzs: '9223372036854775808',
      }),
    ).rejects.toMatchObject({ code: 'AMOUNT_INVALID' });

    expect(users.findUnique).toHaveBeenCalledOnce();
    expect(actor.mint).not.toHaveBeenCalled();
    expect(withActor).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(auth.getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('rejects negative money even when DTO validation is bypassed', async () => {
    const { service, withActor } = setup();

    await expect(
      service.updateSalary(authenticatedUser({ id: ACTOR_ID }), TARGET_ID, {
        fixedSalaryUzs: '-1',
      }),
    ).rejects.toMatchObject({ code: 'AMOUNT_INVALID' });

    expect(withActor).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.deleteUser (PHASE 36)', () => {
  it('permanently deletes a Cashier account with role assignments and revokes its sessions', async () => {
    const { service, users, tx, withActor, sessions } = setup();

    await service.deleteUser(directorActor(), TARGET_ID);

    expect(withActor).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(users.delete).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
    expect(sessions.destroyAllForUser).toHaveBeenCalledWith(TARGET_ID);
  });

  it('permanently deletes a Finance Manager account', async () => {
    const { service, users, tx, sessions } = setup();
    tx.$queryRaw.mockResolvedValueOnce([
      { status: 'active', is_system: false, is_director: false },
    ]);

    await service.deleteUser(directorActor(), TARGET_ID);

    expect(users.delete).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
    expect(sessions.destroyAllForUser).toHaveBeenCalledWith(TARGET_ID);
  });

  it('locks only the target account and does not update historical business rows', async () => {
    const { service, users, tx } = setup();

    await service.deleteUser(directorActor(), TARGET_ID);

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(users.update).not.toHaveBeenCalled();
    expect(users.delete).toHaveBeenCalledOnce();
  });

  it('rejects self-delete before opening a transaction', async () => {
    const { service, users, withActor, sessions } = setup();

    await expect(service.deleteUser(directorActor(TARGET_ID), TARGET_ID)).rejects.toMatchObject({
      code: 'SELF_DELETE_DENIED',
    });

    expect(withActor).not.toHaveBeenCalled();
    expect(users.delete).not.toHaveBeenCalled();
    expect(sessions.destroyAllForUser).not.toHaveBeenCalled();
  });

  it('rejects a non-Director even if a stale/manual user.delete permission is present', async () => {
    const { service, users, withActor, sessions } = setup();
    const staleActor = authenticatedUser({
      id: ACTOR_ID,
      permissions: ['user.delete'],
      roles: [
        {
          id: '00000000-0000-4000-8000-000000000009',
          role: 'finance_manager',
          roleName: 'Moliya rahbari',
          branchId: null,
          branchName: null,
        },
      ],
    });

    await expect(service.deleteUser(staleActor, TARGET_ID)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });

    expect(withActor).not.toHaveBeenCalled();
    expect(users.delete).not.toHaveBeenCalled();
    expect(sessions.destroyAllForUser).not.toHaveBeenCalled();
  });

  it('never deletes the system actor', async () => {
    const { service, users, tx, withActor } = setup();
    tx.$queryRaw.mockResolvedValueOnce([
      { status: 'inactive', is_system: true, is_director: false },
    ]);

    await expect(service.deleteUser(directorActor(), TARGET_ID)).rejects.toMatchObject({
      code: 'SYSTEM_USER_DELETE_DENIED',
    });

    expect(withActor).toHaveBeenCalledOnce();
    expect(users.delete).not.toHaveBeenCalled();
  });

  it('protects the last active Director before account deletion', async () => {
    const { service, users, tx, sessions } = setup();
    tx.$queryRaw.mockResolvedValueOnce([
      { status: 'active', is_system: false, is_director: true },
    ]);
    users.count.mockResolvedValueOnce(0);

    await expect(service.deleteUser(directorActor(), TARGET_ID)).rejects.toMatchObject({
      code: 'LAST_DIRECTOR_REQUIRED',
    });

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(users.delete).not.toHaveBeenCalled();
    expect(sessions.destroyAllForUser).not.toHaveBeenCalled();
  });

  it('keeps the transaction fail-closed if an unmanaged foreign key blocks deletion', async () => {
    const { service, users, sessions } = setup();
    users.delete.mockRejectedValueOnce({ code: 'P2003' });

    await expect(service.deleteUser(directorActor(), TARGET_ID)).rejects.toMatchObject({
      code: 'USER_DELETE_NOT_ALLOWED',
    });

    expect(users.delete).toHaveBeenCalledOnce();
    expect(sessions.destroyAllForUser).not.toHaveBeenCalled();
  });

  it('translates a concurrent double-delete into the stable not-found contract', async () => {
    const { service, users, sessions } = setup();
    users.delete.mockRejectedValueOnce({ code: 'P2025' });

    await expect(service.deleteUser(directorActor(), TARGET_ID)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });

    expect(users.delete).toHaveBeenCalledOnce();
    expect(sessions.destroyAllForUser).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.updateStatus (PHASE 33)', () => {
  it('soft-deactivates another user through the actor-aware transaction', async () => {
    const { service, users, withActor, actor, auth, safeProjection } = setup();

    const result = await service.updateStatus(directorActor(), TARGET_ID, { status: 'inactive' });

    expect(actor.mint).toHaveBeenCalledWith(ACTOR_ID);
    expect(withActor).toHaveBeenCalledTimes(1);
    expect(users.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { status: 'inactive' },
    });
    expect(auth.getAuthenticatedUser).toHaveBeenCalledWith(TARGET_ID, false);
    expect(result).toEqual(safeProjection);
  });

  it('rejects self-deactivation before opening an actor transaction', async () => {
    const { service, users, withActor } = setup();

    await expect(
      service.updateStatus(directorActor(TARGET_ID), TARGET_ID, { status: 'blocked' }),
    ).rejects.toMatchObject({ code: 'SELF_DEACTIVATION_DENIED' });

    expect(users.count).not.toHaveBeenCalled();
    expect(withActor).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
  });

  it('keeps the last active Director and counts only active Director roles', async () => {
    const { service, users, withActor } = setup();
    users.findUnique.mockResolvedValueOnce({
      id: TARGET_ID,
      status: 'active',
      user_roles: [{ role: { code: 'director', is_active: true } }],
    });
    users.count.mockResolvedValueOnce(0);

    await expect(
      service.updateStatus(directorActor(), TARGET_ID, { status: 'inactive' }),
    ).rejects.toMatchObject({ code: 'LAST_DIRECTOR_REQUIRED' });

    expect(users.count).toHaveBeenCalledWith({
      where: {
        id: { not: TARGET_ID },
        status: 'active',
        user_roles: {
          some: {
            is_active: true,
            revoked_at: null,
            role: { code: 'director', is_active: true },
          },
        },
      },
    });
    expect(withActor).toHaveBeenCalledOnce();
    expect(users.update).not.toHaveBeenCalled();
  });

  it('serializes the active Director check and status mutation in one actor transaction', async () => {
    const { service, users, tx, withActor } = setup();
    users.findUnique.mockResolvedValueOnce({
      id: TARGET_ID,
      status: 'active',
      user_roles: [{ role: { code: 'director', is_active: true } }],
    });
    users.count.mockResolvedValueOnce(1);

    await service.updateStatus(directorActor(), TARGET_ID, { status: 'inactive' });

    expect(withActor).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(users.count).toHaveBeenCalledOnce();
    expect(users.update).toHaveBeenCalledOnce();
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      users.count.mock.invocationCallOrder[0]!,
    );
    expect(users.count.mock.invocationCallOrder[0]).toBeLessThan(
      users.update.mock.invocationCallOrder[0]!,
    );
  });

  it('does not treat an inactive Director role as an active Director target', async () => {
    const { service, users } = setup();
    users.findUnique.mockResolvedValueOnce({
      id: TARGET_ID,
      status: 'active',
      user_roles: [{ role: { code: 'director', is_active: false } }],
    });

    await service.updateStatus(directorActor(), TARGET_ID, { status: 'inactive' });

    expect(users.count).not.toHaveBeenCalled();
    expect(users.update).toHaveBeenCalledOnce();
  });
});
