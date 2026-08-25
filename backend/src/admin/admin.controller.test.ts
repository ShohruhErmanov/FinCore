import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { AdminController } from './admin.controller';
import type { AdminRolesService } from './roles.service';
import type { AdminUsersService } from './users.service';

const ACTOR_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000002';

function user(role: 'director' | 'finance_manager' | 'cashier', permissions: string[]) {
  return {
    id: ACTOR_ID,
    fullName: role,
    phone: '+998900000000',
    status: 'active',
    roles: [
      {
        id: `assignment-${role}`,
        role,
        roleName: role,
        branchId: role === 'cashier' ? '00000000-0000-4000-8000-000000000003' : null,
        branchName: null,
      },
    ],
    permissions,
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  } as AuthenticatedUser;
}

function contextFor(
  actor: AuthenticatedUser,
  handler: typeof AdminController.prototype.updateStatus | typeof AdminController.prototype.deleteUser =
    AdminController.prototype.updateStatus,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AdminController,
    switchToHttp: () => ({ getRequest: () => ({ user: actor }) }),
  } as unknown as ExecutionContext;
}

describe('AdminController user status permission', () => {
  it('allows a Director holding user.deactivate to reach the soft-deactivation service', async () => {
    const users = {
      updateStatus: vi.fn().mockResolvedValue({ id: TARGET_ID, status: 'inactive' }),
    } as unknown as AdminUsersService;
    const controller = new AdminController(users, {} as AdminRolesService);
    const guard = new PermissionsGuard(new Reflector());
    const actor = user('director', ['user.manage', 'user.deactivate']);

    expect(guard.canActivate(contextFor(actor))).toBe(true);
    await controller.updateStatus(actor, TARGET_ID, { status: 'inactive' });

    expect(users.updateStatus).toHaveBeenCalledWith(actor, TARGET_ID, { status: 'inactive' });
  });

  it.each([
    ['Finance Manager', user('finance_manager', ['user.manage'])],
    ['Cashier', user('cashier', [])],
  ])('denies %s before the mutation service is called', (_label, actor) => {
    const users = { updateStatus: vi.fn() } as unknown as AdminUsersService;
    const controller = new AdminController(users, {} as AdminRolesService);
    const guard = new PermissionsGuard(new Reflector());

    expect(() => guard.canActivate(contextFor(actor))).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    expect(controller).toBeDefined();
    expect(users.updateStatus).not.toHaveBeenCalled();
  });
});

describe('AdminController user delete permission', () => {
  it('allows a Director holding user.delete to reach the hard-delete service', async () => {
    const users = { deleteUser: vi.fn().mockResolvedValue(undefined) } as unknown as AdminUsersService;
    const controller = new AdminController(users, {} as AdminRolesService);
    const guard = new PermissionsGuard(new Reflector());
    const actor = user('director', ['user.manage', 'user.delete']);

    expect(guard.canActivate(contextFor(actor, AdminController.prototype.deleteUser))).toBe(true);
    await controller.deleteUser(actor, TARGET_ID);

    expect(users.deleteUser).toHaveBeenCalledWith(actor, TARGET_ID);
  });

  it.each([
    ['Finance Manager', user('finance_manager', ['user.manage', 'user.deactivate'])],
    ['Cashier', user('cashier', [])],
  ])('denies %s before the hard-delete service is called', (_label, actor) => {
    const users = { deleteUser: vi.fn() } as unknown as AdminUsersService;
    const controller = new AdminController(users, {} as AdminRolesService);
    const guard = new PermissionsGuard(new Reflector());

    expect(() =>
      guard.canActivate(contextFor(actor, AdminController.prototype.deleteUser)),
    ).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(users.deleteUser).not.toHaveBeenCalled();
  });
});
