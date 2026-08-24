import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '@/auth';
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

function setup() {
  const users = {
    findUnique: vi.fn().mockResolvedValue({
      id: TARGET_ID,
      status: 'active',
      user_roles: [],
    }),
    update: vi.fn().mockResolvedValue({ id: TARGET_ID }),
  };
  const tx = { users };
  const withActor = vi.fn(
    async (_token: string, work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
  );
  const prisma = {
    db: { users },
    withActor,
  } as unknown as PrismaService;
  const actor = {
    mint: vi.fn().mockReturnValue('signed-actor-token'),
  } as unknown as ActorContextService;
  const safeProjection = authenticatedUser();
  const auth = {
    getAuthenticatedUser: vi.fn().mockResolvedValue(safeProjection),
  } as unknown as AuthService;

  return {
    service: new AdminUsersService(prisma, actor, auth),
    users,
    withActor,
    actor,
    auth,
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
