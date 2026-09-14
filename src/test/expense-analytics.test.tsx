import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseAnalyticsPage } from '@/features/dashboard/expense-analytics-page';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import { routes } from '@/shared/config/routes';
import type { ExpenseAnalytics } from '@/shared/types/domain';

vi.mock('@/shared/api/contracts', () => ({
  reportApi: { expenseAnalytics: vi.fn() },
  referenceApi: { periods: vi.fn() },
}));

const PERIOD_ID = '00000000-0000-4000-8000-000000002026';
const data: ExpenseAnalytics = {
  filters: { from: '2026-08-01', to: '2026-08-31', branch: 'all' },
  hasData: true,
  planComparison: {
    periodId: PERIOD_ID,
    periodLabel: 'Avgust 2026',
    hasPlan: true,
    plannedAmountUzs: '60000000',
    actualAmountUzs: '45000000',
    varianceUzs: '15000000',
    completionPct: 75,
  },
  summary: {
    totalAmountUzs: '45000000',
    transactionCount: 4,
    fixed: { amountUzs: '30000000', transactionCount: 2, sharePct: 66.67 },
    variable: { amountUzs: '15000000', transactionCount: 2, sharePct: 33.33 },
  },
  paymentMethods: [
    {
      id: 'pay-cash',
      code: 'CASH',
      name: 'Naqd pul',
      amountUzs: '15000000',
      transactionCount: 1,
      sharePct: 33.33,
    },
    {
      id: 'pay-card',
      code: 'CARD',
      name: 'Plastik karta',
      amountUzs: '18000000',
      transactionCount: 2,
      sharePct: 40,
    },
    {
      id: 'pay-bank',
      code: 'BANK_TRANSFER',
      name: 'Bank o‘tkazmasi',
      amountUzs: '12000000',
      transactionCount: 1,
      sharePct: 26.67,
    },
  ],
  branches: [
    {
      branchId: 'branch-a',
      branchName: 'Sayxun',
      totalAmountUzs: '25000000',
      transactionCount: 2,
      fixedAmountUzs: '20000000',
      variableAmountUzs: '5000000',
      paymentMethods: [],
    },
    {
      branchId: 'branch-b',
      branchName: 'Xalqlar do‘stligi',
      totalAmountUzs: '20000000',
      transactionCount: 2,
      fixedAmountUzs: '10000000',
      variableAmountUzs: '10000000',
      paymentMethods: [],
    },
  ],
  categories: [
    {
      categoryId: 'category-rent',
      categoryCodeSnapshot: 'RENT',
      categoryNameSnapshot: 'Ijara',
      expenseTypeSnapshot: 'fixed',
      amountUzs: '20000000',
      transactionCount: 1,
      sharePct: 44.44,
    },
  ],
  recentExpenses: [
    {
      id: 'expense-1',
      transactionDate: '2026-08-20',
      description: 'Ofis ijarasi',
      amountUzs: '20000000',
      expenseTypeSnapshot: 'fixed',
      branchName: 'Sayxun',
      categoryNameSnapshot: 'Ijara',
      paymentMethodName: 'Bank o‘tkazmasi',
    },
  ],
};

function renderPage(initialUrl = `${routes.expenseAnalytics}?period=${PERIOD_ID}&branch=all`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ExpenseAnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Expense Analytics dashboard', () => {
  beforeEach(() => {
    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: PERIOD_ID,
        year: 2026,
        month: 8,
        label: 'Avgust 2026',
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
    ]);
    vi.mocked(reportApi.expenseAnalytics).mockResolvedValue(data);
  });

  it('bitta requestdan summary, to‘lov, filial, kategoriya va recent analyticsni chiqaradi', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Xarajatlar' })).toBeInTheDocument();
    expect(reportApi.expenseAnalytics).toHaveBeenCalledWith(
      { period: PERIOD_ID, from: '2026-08-01', to: '2026-08-31', branch: 'all' },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Jami xarajatlar')).toBeInTheDocument();
    expect(screen.getByText('Jami xarajatlar holati')).toBeInTheDocument();
    expect(screen.getByText('Rejagacha yetmagan')).toBeInTheDocument();
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        (_, element) => element?.textContent?.replace(/\s/g, '') === '45000000so‘m',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Doimiy xarajatlar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('O‘zgaruvchan xarajatlar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Naqd pul').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Plastik karta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bank o‘tkazmasi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sayxun').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Xalqlar do‘stligi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ijara').length).toBeGreaterThan(0);
    expect(screen.getByText('Ofis ijarasi')).toBeInTheDocument();
    expect(screen.queryByText('Filial xarajatlari taqqoslash')).not.toBeInTheDocument();
    expect(screen.queryByText('Xarajat turlari')).not.toBeInTheDocument();
    expect(screen.queryByText('To‘lov usullari bo‘yicha xarajatlar')).not.toBeInTheDocument();
  });

  it('custom sana filtri barcha analytics requestini bir xil oraliqqa yangilaydi', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Xarajatlar' });

    fireEvent.change(screen.getByLabelText('Davr'), { target: { value: 'custom' } });
    fireEvent.change(await screen.findByLabelText('Boshlanish sanasi'), {
      target: { value: '2026-08-10' },
    });
    fireEvent.change(screen.getByLabelText('Tugash sanasi'), { target: { value: '2026-08-20' } });

    await waitFor(() =>
      expect(reportApi.expenseAnalytics).toHaveBeenLastCalledWith(
        { period: PERIOD_ID, from: '2026-08-10', to: '2026-08-20', branch: 'all' },
        expect.any(AbortSignal),
      ),
    );
  });

  it('loading, empty va xato holatlarini aniq ko‘rsatadi', async () => {
    vi.mocked(reportApi.expenseAnalytics).mockReturnValueOnce(new Promise(() => undefined));
    const loading = renderPage();
    expect(await screen.findByText('Xarajatlar tahlili yuklanmoqda…')).toBeInTheDocument();
    loading.unmount();

    vi.mocked(reportApi.expenseAnalytics).mockResolvedValueOnce({
      ...data,
      hasData: false,
      planComparison: { ...data.planComparison, hasPlan: false },
    });
    const empty = renderPage();
    expect(await screen.findByText('Ushbu davr uchun xarajatlar topilmadi')).toBeInTheDocument();
    empty.unmount();

    vi.mocked(reportApi.expenseAnalytics).mockRejectedValueOnce(new Error('network'));
    renderPage();
    expect(
      await screen.findByText('Xarajatlar ma’lumotlarini yuklab bo‘lmadi.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Qayta urinish' })).toBeInTheDocument();
  });
});
