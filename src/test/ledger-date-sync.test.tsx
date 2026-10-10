import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseLedgerPage } from '@/features/expenses/ExpensePages';
import { RevenueLedgerPage } from '@/features/revenue/RevenuePages';
import { formatMoney } from '@/shared/lib/format';
import type { AccountingPeriod } from '@/shared/types/domain';

const api = vi.hoisted(() => ({
  me: vi.fn(),
  periods: vi.fn(),
  branches: vi.fn(),
  categories: vi.fn(),
  departments: vi.fn(),
  paymentMethods: vi.fn(),
  users: vi.fn(),
  revenueList: vi.fn(),
  expenseList: vi.fn(),
}));

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ hasPermission: () => false }),
}));

vi.mock('@/shared/api/contracts', () => ({
  authApi: { me: api.me },
  referenceApi: {
    periods: api.periods,
    branches: api.branches,
    categories: api.categories,
    departments: api.departments,
    paymentMethods: api.paymentMethods,
    users: api.users,
  },
  revenueApi: { list: api.revenueList },
  expenseApi: { list: api.expenseList },
}));

const period: AccountingPeriod = {
  id: '22222222-2222-4222-8222-222222222222',
  year: 2026,
  month: 8,
  label: 'Avgust 2026',
  status: 'open',
  closedAt: null,
  closedByName: null,
};

function renderLedger(element: React.ReactNode, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function hasMoney(container: HTMLElement, value: string) {
  return [...container.querySelectorAll('span')].some(
    (element) => element.getAttribute('title') === formatMoney(value),
  );
}

describe('navbar period and ledger date filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.me.mockResolvedValue({ permissions: [] });
    api.periods.mockResolvedValue([period]);
    api.branches.mockResolvedValue([]);
    api.categories.mockResolvedValue([]);
    api.departments.mockResolvedValue([]);
    api.paymentMethods.mockResolvedValue([]);
    api.users.mockResolvedValue([]);
    api.revenueList.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 31 });
    api.expenseList.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('synchronizes Kunlik tushum dates with the selected navbar month', async () => {
    renderLedger(
      <RevenueLedgerPage />,
      `/revenues?period=${period.id}&branch=all`,
    );

    expect(await screen.findByLabelText('Boshlanish sanasi')).toHaveValue('2026-08-01');
    expect(screen.getByLabelText('Tugash sanasi')).toHaveValue('2026-08-31');
    await waitFor(() =>
      expect(api.revenueList).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: '2026-08-01', dateTo: '2026-08-31' }),
        expect.anything(),
      ),
    );
  });

  it('synchronizes Jurnal dates with the selected navbar month', async () => {
    renderLedger(
      <ExpenseLedgerPage />,
      `/expenses?period=${period.id}&branch=all`,
    );

    expect(await screen.findByLabelText('Boshlanish sanasi')).toHaveValue('2026-08-01');
    expect(screen.getByLabelText('Tugash sanasi')).toHaveValue('2026-08-31');
    await waitFor(() =>
      expect(api.expenseList).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: '2026-08-01',
          dateTo: '2026-08-31',
          year: '2026',
          month: '8',
        }),
        expect.anything(),
      ),
    );
  });

  it('Kunlik tushumni to‘lov usullari bo‘yicha dashboardda ko‘rsatadi', async () => {
    api.revenueList.mockResolvedValue({
      items: [
        {
          id: 'revenue-1',
          businessDate: '2026-08-10',
          periodId: period.id,
          branchId: 'branch-1',
          branchName: 'Sayxun',
          cashUzs: '5000000',
          cardUzs: '3000000',
          transferUzs: '400000',
          totalUzs: '8400000',
          comment: null,
          enteredBy: 'user-1',
          enteredByName: 'Kassir',
          createdAt: '2026-08-10T09:00:00.000Z',
          updatedAt: '2026-08-10T09:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 31,
    });

    renderLedger(<RevenueLedgerPage />, `/revenues?period=${period.id}&branch=all`);

    await waitFor(() => {
      const dashboard = screen.getByRole('region', {
        name: 'Kunlik tushum ko‘rsatkichlari',
      });
      expect(within(dashboard).getByText('Jami tushum')).toBeInTheDocument();
      expect(hasMoney(dashboard, '8400000')).toBe(true);
      expect(hasMoney(dashboard, '5000000')).toBe(true);
      expect(hasMoney(dashboard, '3000000')).toBe(true);
      expect(hasMoney(dashboard, '400000')).toBe(true);
    });
  });

  it('Jurnal summalarini tushunarli dashboard ko‘rsatkichlariga jamlaydi', async () => {
    const expense = (id: string, amountUzs: string) => ({
      id,
      transactionDate: '2026-08-10',
      periodId: period.id,
      branchId: 'branch-1',
      branchName: 'Sayxun',
      categoryId: 'category-1',
      categoryCodeSnapshot: 'RENT',
      categoryNameSnapshot: 'Ijara',
      expenseTypeSnapshot: 'fixed',
      description: 'Ijara xarajati',
      amountUzs,
      paymentMethodId: 'payment-1',
      paymentMethodName: 'Naqd',
      departmentId: 'department-1',
      departmentName: 'Boshqaruv',
      responsibleUserId: 'user-1',
      responsibleUserName: 'Mas’ul',
      enteredBy: 'user-2',
      enteredByName: 'Kassir',
      comment: null,
      sourceSheet: null,
      sourceRow: null,
      createdAt: '2026-08-10T09:00:00.000Z',
      updatedAt: '2026-08-10T09:00:00.000Z',
    });
    api.expenseList.mockResolvedValue({
      items: [expense('expense-1', '7000000'), expense('expense-2', '1400000')],
      total: 6,
      page: 1,
      pageSize: 20,
    });

    renderLedger(<ExpenseLedgerPage />, `/expenses?period=${period.id}&branch=all`);

    await waitFor(() => {
      const dashboard = screen.getByRole('region', { name: 'Jurnal ko‘rsatkichlari' });
      expect(within(dashboard).getByText('Jami xarajat')).toBeInTheDocument();
      expect(hasMoney(dashboard, '8400000')).toBe(true);
      expect(within(dashboard).getByText('6')).toBeInTheDocument();
      expect(hasMoney(dashboard, '4200000')).toBe(true);
      expect(hasMoney(dashboard, '7000000')).toBe(true);
    });
  });
});
