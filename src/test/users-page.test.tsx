import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from '@/features/admin/users-page';
import { ApiError } from '@/shared/api/client';
import type { AuthenticatedUser, PermissionCode, RoleCode } from '@/shared/types/domain';
import { ToastProvider } from '@/shared/ui';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  branches: vi.fn(),
  periods: vi.fn(),
  paymentMethods: vi.fn(),
  users: vi.fn(),
  createUser: vi.fn(),
  updateUserAccess: vi.fn(),
  updateUserSalary: vi.fn(),
  updateUserStatus: vi.fn(),
  deleteUser: vi.fn(),
  updateUserPassword: vi.fn(),
}));

vi.mock('@/features/auth/auth-context', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/shared/api/contracts', () => ({
  referenceApi: {
    branches: mocks.branches,
    periods: mocks.periods,
    paymentMethods: mocks.paymentMethods,
  },
  adminApi: {
    users: mocks.users,
    createUser: mocks.createUser,
    updateUserAccess: mocks.updateUserAccess,
    updateUserSalary: mocks.updateUserSalary,
    updateUserStatus: mocks.updateUserStatus,
    deleteUser: mocks.deleteUser,
    updateUserPassword: mocks.updateUserPassword,
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
  mocks.periods.mockResolvedValue([]);
  mocks.paymentMethods.mockResolvedValue([]);
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
    expect(
      screen.queryByRole('combobox', { name: 'Director User holati' }),
    ).not.toBeInTheDocument();

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

describe('UsersPage Access dialog', () => {
  const target = user('target-user', 'cashier', [], 'Target User');
  const director = user('director-user', 'director', ['user.manage'], 'Director User');
  const NEW = 'yangi-parol-2026!';

  beforeEach(() => {
    mocks.branches.mockResolvedValue([]);
    mocks.updateUserPassword.mockReset().mockResolvedValue(undefined);
  });

  const openAccess = async (name: string) => {
    const rows = await screen.findAllByRole('button', { name: /Access/ });
    const row = rows.find((button) => button.closest('tr')?.textContent?.includes(name));
    fireEvent.click(row!);
    return screen.getByRole('dialog', { name: `${name}: access va parol` });
  };
  /** Labels overlap ("Yangi parol" / "Yangi parolni tasdiqlang"), so match them whole. */
  const type = (dialog: HTMLElement, label: string, value: string) =>
    fireEvent.change(within(dialog).getByLabelText(new RegExp(`^${label}\\s*\\*?$`)), {
      target: { value },
    });

  it('opens as a dialog over the table, so the click is never lost off-screen', async () => {
    renderUsersPage(director, [director, target]);
    const dialog = await openAccess('Target User');
    expect(
      within(dialog).getByRole('region', { name: 'Parolni o‘zgartirish' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'Rol va filial' })).toBeInTheDocument();
  });

  it('resets another user’s password without asking for the old one', async () => {
    renderUsersPage(director, [director, target]);
    const dialog = await openAccess('Target User');

    expect(within(dialog).queryByLabelText(/^Joriy parol/)).not.toBeInTheDocument();
    type(dialog, 'Yangi parol', NEW);
    type(dialog, 'Yangi parolni tasdiqlang', NEW);
    fireEvent.click(within(dialog).getByRole('button', { name: /Parolni saqlash/ }));

    await waitFor(() =>
      expect(mocks.updateUserPassword).toHaveBeenCalledWith('target-user', {
        password: NEW,
        confirmPassword: NEW,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Parol o‘zgartirildi')).toBeInTheDocument();
  });

  it.each([
    ['too short', 'qisqa', 'qisqa', 'Parol kamida 12 belgidan iborat bo‘lsin.'],
    ['not confirmed', NEW, `${NEW}x`, 'Parol va tasdiqlash mos emas.'],
  ])('refuses a password that is %s before calling the server', async (_label, a, b, message) => {
    renderUsersPage(director, [director, target]);
    const dialog = await openAccess('Target User');
    type(dialog, 'Yangi parol', a);
    type(dialog, 'Yangi parolni tasdiqlang', b);
    fireEvent.click(within(dialog).getByRole('button', { name: /Parolni saqlash/ }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it('asks for the current password when you change your own', async () => {
    renderUsersPage(director, [director, target]);
    const dialog = await openAccess('Director User');

    type(dialog, 'Yangi parol', NEW);
    type(dialog, 'Yangi parolni tasdiqlang', NEW);
    fireEvent.click(within(dialog).getByRole('button', { name: /Parolni saqlash/ }));
    expect(await within(dialog).findByText('Joriy parolni kiriting.')).toBeInTheDocument();
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();

    type(dialog, 'Joriy parol', 'eski-parol-2025!');
    fireEvent.click(within(dialog).getByRole('button', { name: /Parolni saqlash/ }));
    await waitFor(() =>
      expect(mocks.updateUserPassword).toHaveBeenCalledWith('director-user', {
        password: NEW,
        confirmPassword: NEW,
        currentPassword: 'eski-parol-2025!',
      }),
    );
  });

  it('does not offer the role form for an investor, which would turn them into a cashier', async () => {
    const investor = { ...user('investor-user', 'investor', [], 'Investor User') };
    investor.roles = [{ ...investor.roles[0]!, roleName: 'Investor' }];
    renderUsersPage(director, [investor]);
    const dialog = await openAccess('Investor User');

    expect(within(dialog).queryByLabelText(/Access modeli/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/Investor rolini bu yerda o‘zgartirib bo‘lmaydi/),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Yangi parol\s*\*?$/)).toBeInTheDocument();
  });

  it('shows the server’s refusal', async () => {
    mocks.updateUserPassword.mockRejectedValueOnce(
      new ApiError(403, {
        code: 'PRIVILEGE_ESCALATION_DENIED',
        message: 'Direktor parolini faqat direktor o‘zgartirishi mumkin.',
      }),
    );
    renderUsersPage(director, [director, target]);
    const dialog = await openAccess('Target User');
    type(dialog, 'Yangi parol', NEW);
    type(dialog, 'Yangi parolni tasdiqlang', NEW);
    fireEvent.click(within(dialog).getByRole('button', { name: /Parolni saqlash/ }));

    expect(
      await within(dialog).findByText('Direktor parolini faqat direktor o‘zgartirishi mumkin.'),
    ).toBeInTheDocument();
  });
});

describe('UsersPage Business Owner protection', () => {
  const owner = user(
    'owner-user',
    'business_owner' as RoleCode,
    ['user.manage', 'user.deactivate', 'user.delete'],
    'Owner User',
  );
  const director = user(
    'director-user',
    'director',
    ['user.manage', 'user.deactivate', 'user.delete'],
    'Director User',
  );

  beforeEach(() => {
    mocks.branches.mockResolvedValue([]);
  });

  const ownerRow = async () => (await screen.findByText('Owner User')).closest('tr')!;

  it('shows a director no control at all on the Business Owner row', async () => {
    renderUsersPage(director, [director, owner]);
    const row = await ownerRow();

    expect(within(row).getByText('Himoyalangan')).toBeInTheDocument();
    expect(
      within(row).queryByRole('combobox', { name: 'Owner User holati' }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: 'Owner Userni o‘chirish' }),
    ).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Access/ })).not.toBeInTheDocument();
    // The salary is shown, not editable.
    expect(within(row).queryByLabelText('Owner User fix oyligi')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Saqlash' })).not.toBeInTheDocument();
  });

  it('still shows the director every control on other rows', async () => {
    const cashier = user('cashier-user', 'cashier', [], 'Cashier User');
    renderUsersPage(director, [director, owner, cashier]);
    const row = (await screen.findByText('Cashier User')).closest('tr')!;

    expect(within(row).getByRole('combobox', { name: 'Cashier User holati' })).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Cashier Userni o‘chirish' }),
    ).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /Access/ })).toBeInTheDocument();
  });

  it('lets the Business Owner open their own Access, for their password', async () => {
    renderUsersPage(owner, [director, owner]);
    const row = await ownerRow();

    expect(within(row).queryByText('Himoyalangan')).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: /Access/ }));
    const dialog = screen.getByRole('dialog', { name: 'Owner User: access va parol' });
    expect(within(dialog).getByLabelText(/^Joriy parol/)).toBeInTheDocument();
  });
});

describe('UsersPage columns', () => {
  it('has no fixed-salary column', async () => {
    const director = user('director-user', 'director', ['user.manage'], 'Director User');
    const cashier = user('cashier-user', 'cashier', [], 'Cashier User');
    mocks.branches.mockResolvedValue([]);
    renderUsersPage(director, [director, cashier]);

    await screen.findByText('Cashier User');
    expect(screen.queryByRole('columnheader', { name: 'Fix oylik' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/fix oyligi$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saqlash' })).not.toBeInTheDocument();
  });
});
