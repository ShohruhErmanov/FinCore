import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from '@/features/admin/users-page';
import { ApiError } from '@/shared/api/client';
import type { AuthenticatedUser, PermissionCode, RoleCode } from '@/shared/types/domain';
import { ToastProvider } from '@/shared/ui';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  branches: vi.fn(),
  users: vi.fn(),
  createUser: vi.fn(),
  updateUserAccess: vi.fn(),
  updateUserSalary: vi.fn(),
  updateUserStatus: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('@/features/auth/auth-context', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/shared/api/contracts', () => ({
  referenceApi: { branches: mocks.branches },
  adminApi: {
    users: mocks.users,
    createUser: mocks.createUser,
    updateUserAccess: mocks.updateUserAccess,
    updateUserSalary: mocks.updateUserSalary,
    updateUserStatus: mocks.updateUserStatus,
    deleteUser: mocks.deleteUser,
  },
}));

function user(
  id: string,
  role: RoleCode,
  permissions: PermissionCode[],
  fullName: string = role,
): AuthenticatedUser {
  return {
    id,
    fullName,
    phone: '+998900000000',
    status: 'active',
    roles: [
      {
        id: `assignment-${id}`,
        role,
        roleName: role,
        branchId: role === 'cashier' ? 'branch-1' : null,
        branchName: role === 'cashier' ? 'Sayxun' : null,
      },
    ],
    permissions,
    branchScopes: role === 'cashier' ? ['branch-1'] : ['branch-1', 'branch-2'],
    writeBranchScopes: role === 'cashier' ? ['branch-1'] : [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  };
}

function renderUsersPage(actor: AuthenticatedUser, rows: AuthenticatedUser[]) {
  mocks.useAuth.mockReturnValue({
    user: actor,
    hasPermission: (permission: PermissionCode) => actor.permissions.includes(permission),
  });
  mocks.users.mockResolvedValue(rows);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('UsersPage user.deactivate permission', () => {
  const target = user('target-user', 'cashier', [], 'Target User');

  beforeEach(() => {
    mocks.branches.mockResolvedValue([]);
    mocks.updateUserStatus.mockResolvedValue({ ...target, status: 'inactive' });
  });

  it('lets Director deactivate another user through the existing PATCH action', async () => {
    const director = user(
      'director-user',
      'director',
      ['user.manage', 'user.deactivate'],
      'Director User',
    );
    renderUsersPage(director, [director, target]);

    const action = await screen.findByRole('combobox', { name: 'Target User holati' });
    expect(screen.queryByRole('combobox', { name: 'Director User holati' })).not.toBeInTheDocument();

    fireEvent.change(action, { target: { value: 'inactive' } });

    await waitFor(() =>
      expect(mocks.updateUserStatus).toHaveBeenCalledWith('target-user', 'inactive'),
    );
  });

  it.each([
    ['Finance Manager', user('finance-user', 'finance_manager', ['user.manage'])],
    ['Cashier', user('cashier-user', 'cashier', [])],
  ])('does not expose the status action to %s', async (_label, actor) => {
    renderUsersPage(actor, [target]);

    expect(await screen.findByText('Target User')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Target User holati' })).not.toBeInTheDocument();
    expect(mocks.updateUserStatus).not.toHaveBeenCalled();
  });
});

describe('UsersPage user.delete permission', () => {
  const target = user('target-user', 'cashier', [], 'Target User');

  beforeEach(() => {
    mocks.branches.mockResolvedValue([]);
    mocks.deleteUser.mockResolvedValue(undefined);
  });

  it('shows Delete only for another user and requires confirmation', async () => {
    const director = user(
      'director-user',
      'director',
      ['user.manage', 'user.deactivate', 'user.delete'],
      'Director User',
    );
    renderUsersPage(director, [director, target]);

    const action = await screen.findByRole('button', { name: 'Target Userni o‘chirish' });
    expect(
      screen.queryByRole('button', { name: 'Director Userni o‘chirish' }),
    ).not.toBeInTheDocument();

    fireEvent.click(action);

    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(
      screen.getByText('Target User foydalanuvchisi butunlay o‘chiriladi. Davom etasizmi?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Butunlay o‘chirish' }));

    await waitFor(() => expect(mocks.deleteUser).toHaveBeenCalledWith('target-user'));
  });

  it('does not delete when confirmation is cancelled', async () => {
    const director = user('director-user', 'director', ['user.manage', 'user.delete']);
    renderUsersPage(director, [target]);

    fireEvent.click(await screen.findByRole('button', { name: 'Target Userni o‘chirish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));

    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(screen.queryByText('Foydalanuvchini butunlay o‘chirish')).not.toBeInTheDocument();
  });

  it.each([
    ['Finance Manager', user('finance-user', 'finance_manager', ['user.manage'])],
    ['Cashier', user('cashier-user', 'cashier', [])],
  ])('does not expose Delete to %s', async (_label, actor) => {
    renderUsersPage(actor, [target]);

    expect(await screen.findByText('Target User')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Target Userni o‘chirish' }),
    ).not.toBeInTheDocument();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('shows the backend historical-dependency rejection', async () => {
    const director = user('director-user', 'director', ['user.manage', 'user.delete']);
    mocks.deleteUser.mockRejectedValueOnce(
      new ApiError(409, {
        code: 'USER_DELETE_NOT_ALLOWED',
        message:
          'Foydalanuvchini o‘chirib bo‘lmaydi: unga moliyaviy, audit yoki tarixiy ma’lumotlar bog‘langan.',
      }),
    );
    renderUsersPage(director, [target]);

    fireEvent.click(await screen.findByRole('button', { name: 'Target Userni o‘chirish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Butunlay o‘chirish' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('User o‘chirilmadi');
    expect(alert).toHaveTextContent('moliyaviy, audit yoki tarixiy ma’lumotlar');
  });
});
