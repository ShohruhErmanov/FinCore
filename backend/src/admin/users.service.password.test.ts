import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword, type AuthService, type SessionService } from '@/auth';
import type { AuthenticatedUser } from '@/common';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { ActorContextService, PrismaService } from '@/database';
import { AdminController } from './admin.controller';
import type { AdminRolesService } from './roles.service';
import { AdminUsersService } from './users.service';

const ACTOR_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000002';
const NEW_PASSWORD = 'yangi-parol-2026!';

function person(id: string, role: string, permissions: string[]): AuthenticatedUser {
  return {
    id,
    fullName: role,
    phone: '+998900000000',
    status: 'active',
    roles: [{ id: `assignment-${id}`, role, roleName: role, branchId: null, branchName: null }],
    permissions,
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  } as AuthenticatedUser;
}

const director = () => person(ACTOR_ID, 'director', ['user.manage']);

function setup(target: { roles?: string[]; isSystem?: boolean; storedHash?: string } = {}) {
  const findUnique = vi.fn(async ({ select }: { select: Record<string, unknown> }) =>
    'password_hash' in select
      ? { password_hash: target.storedHash ?? 'not-a-real-hash' }
      : {
          id: TARGET_ID,
          status: 'active',
          is_system: target.isSystem ?? false,
          user_roles: (target.roles ?? ['cashier']).map((code) => ({
            role: { code, is_active: true },
          })),
        },
  );
  const tx = {
    users: { update: vi.fn().mockResolvedValue({ id: TARGET_ID }) },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const withActor = vi.fn(
    async (_token: string, work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
  );
  const prisma = { db: { users: { findUnique } }, withActor } as unknown as PrismaService;
  const actor = { mint: vi.fn().mockReturnValue('signed') } as unknown as ActorContextService;
  const sessions = { destroyAllForUser: vi.fn() } as unknown as SessionService;
  return {
    service: new AdminUsersService(prisma, actor, {} as AuthService, sessions),
    tx,
    withActor,
    sessions,
  };
}

/** Every value bound into the audit INSERT, as one string. */
const auditValues = (tx: ReturnType<typeof setup>['tx']) =>
  JSON.stringify(tx.$executeRaw.mock.calls[0]?.slice(1) ?? []);

const rejects = (promise: Promise<unknown>, code: string, status: number) =>
  expect(promise).rejects.toMatchObject({ code, status });

describe('AdminUsersService.updatePassword', () => {
  it('lets a director reset a cashier password, hashed, audited and with sessions ended', async () => {
    const { service, tx, sessions } = setup();

    await service.updatePassword(director(), TARGET_ID, {
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    const { password_hash } = tx.users.update.mock.calls[0]![0].data;
    expect(password_hash).not.toBe(NEW_PASSWORD);
    await expect(verifyPassword(NEW_PASSWORD, password_hash)).resolves.toBe(true);

    expect(auditValues(tx)).toContain('users.password_reset');
    // Neither the password nor its hash ever reaches the audit trail.
    expect(auditValues(tx)).not.toContain(NEW_PASSWORD);
    expect(auditValues(tx)).not.toContain(password_hash);
    expect(sessions.destroyAllForUser).toHaveBeenCalledWith(TARGET_ID);
  });

  it('refuses a confirmation that does not match, before touching anything', async () => {
    const { service, withActor } = setup();
    await rejects(
      service.updatePassword(director(), TARGET_ID, {
        password: NEW_PASSWORD,
        confirmPassword: `${NEW_PASSWORD}x`,
      }),
      'PASSWORD_MISMATCH',
      422,
    );
    expect(withActor).not.toHaveBeenCalled();
  });

  it('never sets a password on the system actor', async () => {
    const { service, withActor } = setup({ isSystem: true });
    await rejects(
      service.updatePassword(director(), TARGET_ID, {
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
      'SYSTEM_USER_PASSWORD_DENIED',
      409,
    );
    expect(withActor).not.toHaveBeenCalled();
  });

  it('does not let a director take over the Business Owner account', async () => {
    const { service, withActor } = setup({ roles: ['business_owner'] });
    await rejects(
      service.updatePassword(director(), TARGET_ID, {
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
      'BUSINESS_OWNER_PASSWORD_DENIED',
      403,
    );
    expect(withActor).not.toHaveBeenCalled();
  });

  it('does not let a finance manager reset a director', async () => {
    const { service, withActor } = setup({ roles: ['director'] });
    const financeManager = person(ACTOR_ID, 'finance_manager', ['user.manage']);
    await rejects(
      service.updatePassword(financeManager, TARGET_ID, {
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
      'PRIVILEGE_ESCALATION_DENIED',
      403,
    );
    expect(withActor).not.toHaveBeenCalled();
  });

  describe('changing your own password', () => {
    const self = () => person(TARGET_ID, 'director', ['user.manage']);

    it('asks for the current password', async () => {
      const { service, withActor } = setup({ roles: ['director'] });
      await rejects(
        service.updatePassword(self(), TARGET_ID, {
          password: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        }),
        'CURRENT_PASSWORD_REQUIRED',
        422,
      );
      expect(withActor).not.toHaveBeenCalled();
    });

    it('refuses a wrong current password', async () => {
      const storedHash = await hashPassword('eski-parol-2025!');
      const { service, withActor } = setup({ roles: ['director'], storedHash });
      await rejects(
        service.updatePassword(self(), TARGET_ID, {
          currentPassword: 'notogri-parol-0000',
          password: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        }),
        'CURRENT_PASSWORD_INVALID',
        422,
      );
      expect(withActor).not.toHaveBeenCalled();
    });

    it('changes it with the right one, recorded as a self change', async () => {
      const storedHash = await hashPassword('eski-parol-2025!');
      const { service, tx, sessions } = setup({ roles: ['director'], storedHash });
      await service.updatePassword(self(), TARGET_ID, {
        currentPassword: 'eski-parol-2025!',
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      expect(tx.users.update).toHaveBeenCalledTimes(1);
      expect(auditValues(tx)).toContain('users.password_change');
      expect(sessions.destroyAllForUser).toHaveBeenCalledWith(TARGET_ID);
    });

    it('lets the Business Owner change their own', async () => {
      const storedHash = await hashPassword('eski-parol-2025!');
      const { service, tx } = setup({ roles: ['business_owner'], storedHash });
      await service.updatePassword(
        person(TARGET_ID, 'business_owner', ['user.manage']),
        TARGET_ID,
        {
          currentPassword: 'eski-parol-2025!',
          password: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        },
      );
      expect(tx.users.update).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps existing sessions when the write fails', async () => {
    const { service, tx, sessions } = setup();
    tx.users.update.mockRejectedValue(new Error('connection lost'));
    await expect(
      service.updatePassword(director(), TARGET_ID, {
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow();
    expect(sessions.destroyAllForUser).not.toHaveBeenCalled();
  });
});

describe('PUT /users/:id/password', () => {
  const contextFor = (actor: AuthenticatedUser): ExecutionContext =>
    ({
      getHandler: () => AdminController.prototype.updatePassword,
      getClass: () => AdminController,
      switchToHttp: () => ({ getRequest: () => ({ user: actor }) }),
    }) as unknown as ExecutionContext;

  it('requires user.manage', () => {
    const guard = new PermissionsGuard(new Reflector());
    expect(guard.canActivate(contextFor(director()))).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(person(ACTOR_ID, 'cashier', ['revenue.view_own_branch']))),
    ).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('hands the body to the service and returns nothing', async () => {
    const users = { updatePassword: vi.fn().mockResolvedValue(undefined) };
    const controller = new AdminController(
      users as unknown as AdminUsersService,
      {} as AdminRolesService,
    );
    const body = { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };
    await expect(controller.updatePassword(director(), TARGET_ID, body)).resolves.toBeUndefined();
    expect(users.updatePassword).toHaveBeenCalledWith(director(), TARGET_ID, body);
  });
});
