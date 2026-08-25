import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseCreatePage } from '@/features/expenses/ExpensePages';
import { RevenueCreatePage } from '@/features/revenue/RevenuePages';
import type { AuthenticatedUser, Branch } from '@/shared/types/domain';

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  branches: vi.fn(),
  periods: vi.fn(),
  categories: vi.fn(),
  departments: vi.fn(),
  paymentMethods: vi.fn(),
  users: vi.fn(),
  createRevenue: vi.fn(),
  createExpense: vi.fn(),
}));

vi.mock('@/shared/api/contracts', () => ({
  authApi: { me: apiMocks.me },
  referenceApi: {
    branches: apiMocks.branches,
    periods: apiMocks.periods,
    categories: apiMocks.categories,
    departments: apiMocks.departments,
    paymentMethods: apiMocks.paymentMethods,
    users: apiMocks.users,
  },
  revenueApi: { create: apiMocks.createRevenue },
  expenseApi: { create: apiMocks.createExpense },
}));

const branches: Branch[] = [
  { id: 'branch-a', code: 'SAYXUN', name: 'Sayxun', isActive: true },
  { id: 'branch-b', code: 'XALQLAR', name: 'Xalqlar', isActive: true },
  { id: 'branch-inactive', code: 'SAYXUN', name: 'Yopiq filial', isActive: false },
  { id: 'branch-read-only', code: 'XALQLAR', name: 'Faqat ko‘rish', isActive: true },
];

function userWithWriteScopes(writeBranchScopes: string[]): AuthenticatedUser {
  return {
    id: 'user-1',
    fullName: 'Test User',
    phone: '+998000000000',
    status: 'active',
    roles: [
      {
        id: 'assignment-1',
        role: 'cashier',
        roleName: 'Kassir',
        branchId: writeBranchScopes[0] ?? null,
        branchName: null,
      },
    ],
    permissions: ['revenue.create', 'expense.create'],
    branchScopes: branches.map((branch) => branch.id),
    writeBranchScopes,
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  };
}

function renderPage(page: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('[FE-RBAC] transactional write branch UX', () => {
  beforeEach(() => {
    apiMocks.branches.mockResolvedValue(branches);
    apiMocks.periods.mockResolvedValue([]);
    apiMocks.categories.mockResolvedValue([]);
    apiMocks.departments.mockResolvedValue([]);
    apiMocks.paymentMethods.mockResolvedValue([]);
    apiMocks.users.mockResolvedValue([]);
  });

  it('zero write scope holatida Revenue formani aniq bloklaydi', async () => {
    apiMocks.me.mockResolvedValue(userWithWriteScopes([]));

    renderPage(<RevenueCreatePage />);

    expect(await screen.findByText('Tushum kiritish bloklangan')).toBeInTheDocument();
    expect(screen.getByLabelText('Filial')).toHaveValue(
      'Yozish mumkin bo‘lgan aktiv filial mavjud emas',
    );
    expect(screen.queryByDisplayValue('Filial aniqlanmoqda')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tushumni saqlash/i })).toBeDisabled();
  });

  it('bitta aktiv write scope bo‘lsa Revenue filialini avtomatik tanlaydi', async () => {
    apiMocks.me.mockResolvedValue(userWithWriteScopes(['branch-a']));

    renderPage(<RevenueCreatePage />);

    expect(await screen.findByLabelText('Filial')).toHaveValue('Sayxun');
    expect(screen.getByLabelText('Filial')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: /Tushumni saqlash/i })).toBeEnabled();
  });

  it('bir nechta scope bo‘lsa faqat aktiv writable filiallarni tanlatadi', async () => {
    apiMocks.me.mockResolvedValue(
      userWithWriteScopes(['branch-a', 'branch-b', 'branch-inactive']),
    );

    renderPage(<RevenueCreatePage />);

    const select = await screen.findByRole('combobox', { name: 'Filial' });
    expect(within(select).getByRole('option', { name: 'Sayxun' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Xalqlar' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Yopiq filial' })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Faqat ko‘rish' })).not.toBeInTheDocument();
  });

  it('zero write scope holatida Expense formani ham aniq bloklaydi', async () => {
    apiMocks.me.mockResolvedValue(userWithWriteScopes([]));

    renderPage(<ExpenseCreatePage />);

    expect(await screen.findByText('Xarajat kiritish bloklangan')).toBeInTheDocument();
    expect(screen.getByLabelText('Filial')).toHaveValue(
      'Yozish mumkin bo‘lgan aktiv filial mavjud emas',
    );
    expect(screen.queryByDisplayValue('Filial aniqlanmoqda')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xarajatni saqlash/i })).toBeDisabled();
  });
});
