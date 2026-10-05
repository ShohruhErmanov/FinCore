import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseDetailPage } from '@/features/expenses/ExpensePages';
import { RevenueDetailPage } from '@/features/revenue/RevenuePages';
import type { AuthenticatedUser, DailyRevenue, Expense } from '@/shared/types/domain';

const api = vi.hoisted(() => ({
  me: vi.fn(),
  periods: vi.fn(),
  categories: vi.fn(),
  departments: vi.fn(),
  paymentMethods: vi.fn(),
  users: vi.fn(),
  revenueDetail: vi.fn(),
  revenueUpdate: vi.fn(),
  expenseDetail: vi.fn(),
  expenseUpdate: vi.fn(),
}));

vi.mock('@/shared/api/contracts', () => ({
  authApi: { me: api.me },
  referenceApi: {
    periods: api.periods,
    categories: api.categories,
    departments: api.departments,
    paymentMethods: api.paymentMethods,
    users: api.users,
  },
  revenueApi: { detail: api.revenueDetail, update: api.revenueUpdate },
  expenseApi: { detail: api.expenseDetail, update: api.expenseUpdate },
}));

const BRANCH = '11111111-1111-4111-8111-111111111111';
const PERIOD = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const CATEGORY = '44444444-4444-4444-8444-444444444444';
const METHOD = '55555555-5555-4555-8555-555555555555';
const DEPARTMENT = '66666666-6666-4666-8666-666666666666';

const cashier: AuthenticatedUser = {
  id: USER,
  fullName: 'Kassir',
  phone: '+998900000000',
  status: 'active',
  roles: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      role: 'cashier',
      roleName: 'Kassir',
      branchId: BRANCH,
      branchName: 'Sayxun',
    },
  ],
  permissions: ['revenue.create', 'revenue.edit', 'expense.edit'],
  branchScopes: [BRANCH],
  writeBranchScopes: [BRANCH],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
};

const revenue: DailyRevenue = {
  id: `daily-${BRANCH}-2026-08-20`,
  businessDate: '2026-08-20',
  periodId: PERIOD,
  branchId: BRANCH,
  branchName: 'Sayxun',
  cashUzs: '100',
  cardUzs: '200',
  transferUzs: '300',
  totalUzs: '600',
  comment: null,
  enteredBy: USER,
  enteredByName: 'Kassir',
  createdAt: '2026-08-20T05:00:00.000Z',
  updatedAt: '2026-08-20T05:00:00.000Z',
};

const expense: Expense = {
  id: '88888888-8888-4888-8888-888888888888',
  transactionDate: '2026-08-20',
  periodId: PERIOD,
  branchId: BRANCH,
  branchName: 'Sayxun',
  categoryId: CATEGORY,
  categoryCodeSnapshot: 'RENT',
  categoryNameSnapshot: 'Ijara',
  expenseTypeSnapshot: 'fixed',
  description: 'Ijara to‘lovi',
  amountUzs: '1000',
  paymentMethodId: METHOD,
  paymentMethodName: 'Naqd',
  departmentId: DEPARTMENT,
  departmentName: 'Moliya',
  responsibleUserId: USER,
  responsibleUserName: 'Kassir',
  enteredBy: USER,
  enteredByName: 'Kassir',
  comment: null,
  sourceSheet: null,
  sourceRow: null,
  createdAt: '2026-08-20T05:00:00.000Z',
  updatedAt: '2026-08-20T05:00:00.000Z',
};

function renderRoute(path: string, routePath: string, element: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Cashier edit reason', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.me.mockResolvedValue(cashier);
    api.periods.mockResolvedValue([
      { id: PERIOD, year: 2026, month: 8, label: 'Avgust 2026', status: 'open' },
    ]);
    api.categories.mockResolvedValue([
      { id: CATEGORY, code: 'RENT', name: 'Ijara', expenseType: 'fixed', isActive: true },
    ]);
    api.departments.mockResolvedValue([
      { id: DEPARTMENT, code: 'FIN', name: 'Moliya', isActive: true },
    ]);
    api.paymentMethods.mockResolvedValue([
      { id: METHOD, code: 'CASH', name: 'Naqd', isActive: true },
    ]);
    api.users.mockResolvedValue([{ id: USER, fullName: 'Kassir', status: 'active' }]);
    api.revenueDetail.mockResolvedValue(revenue);
    api.revenueUpdate.mockResolvedValue(revenue);
    api.expenseDetail.mockResolvedValue(expense);
    api.expenseUpdate.mockResolvedValue(expense);
  });

  it('requires and submits a Director-visible reason for a revenue edit', async () => {
    renderRoute(`/revenues/${revenue.id}`, '/revenues/:revenueId', <RevenueDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tahrirlash' }));
    const reason = await screen.findByLabelText(/Tahrirlash izohi/);
    expect(reason).toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash$/ }));
    expect(await screen.findByText('Tahrirlash sababini kiriting.')).toBeInTheDocument();
    expect(api.revenueUpdate).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: 'Terminal yakuni bo‘yicha tuzatildi.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash$/ }));
    await waitFor(() =>
      expect(api.revenueUpdate).toHaveBeenCalledWith(
        revenue.id,
        expect.objectContaining({ editReason: 'Terminal yakuni bo‘yicha tuzatildi.' }),
      ),
    );
  });

  it('requires and submits a Director-visible reason for an expense edit', async () => {
    renderRoute(`/expenses/${expense.id}`, '/expenses/:expenseId', <ExpenseDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tahrirlash' }));
    const reason = await screen.findByLabelText(/Tahrirlash izohi/);
    expect(reason).toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash$/ }));
    expect(await screen.findByText('Tahrirlash sababini kiriting.')).toBeInTheDocument();
    expect(api.expenseUpdate).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: 'Chekdagi summa bo‘yicha tuzatildi.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash$/ }));
    await waitFor(() =>
      expect(api.expenseUpdate).toHaveBeenCalledWith(
        expense.id,
        expect.objectContaining({ editReason: 'Chekdagi summa bo‘yicha tuzatildi.' }),
      ),
    );
  });
});
