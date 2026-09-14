import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpensePlanAnalyticsPage } from '@/features/dashboard/expense-plan-analytics-page';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import { routes } from '@/shared/config/routes';
import type { ExpensePlanAnalytics } from '@/shared/types/domain';

vi.mock('@/shared/api/contracts', () => ({
  reportApi: { expensePlan: vi.fn() },
  referenceApi: { periods: vi.fn() },
}));

const PERIOD_ID = '00000000-0000-4000-8000-000000002026';
const data: ExpensePlanAnalytics = {
  period: { id: PERIOD_ID, year: 2026, month: 8, label: 'Avgust 2026' },
  branchFilter: 'all',
  hasPlan: true,
  summary: {
    fixedPlanUzs: '30000000',
    variablePlanUzs: '24000000',
    totalPlanUzs: '54000000',
    branchCount: 2,
  },
  branches: [
    {
      branchId: '00000000-0000-4000-8000-000000000020',
      branchName: 'Sayxun',
      hasPlan: true,
      fixedPlanUzs: '10000000',
      variablePlanUzs: '4400000',
      totalPlanUzs: '14400000',
    },
    {
      branchId: '00000000-0000-4000-8000-000000000021',
      branchName: 'Xalqlar do‘stligi',
      hasPlan: true,
      fixedPlanUzs: '20000000',
      variablePlanUzs: '19600000',
      totalPlanUzs: '39600000',
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[`${routes.expensePlanAnalytics}?period=${PERIOD_ID}&branch=all`]}
      >
        <ExpensePlanAnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Expense Plan Analytics dashboard', () => {
  beforeEach(() => {
    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: PERIOD_ID,
        year: 2026,
        month: 8,
        label: '2026-08',
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
    ]);
    vi.mocked(reportApi.expensePlan).mockResolvedValue(data);
  });

  it('bitta analytics so‘rovidan summary va filial kartalarini chiqaradi', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Xarajatlar rejasi' })).toBeInTheDocument();
    expect(reportApi.expensePlan).toHaveBeenCalledWith(
      { period: PERIOD_ID, branch: 'all' },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Jami xarajat rejasi')).toBeInTheDocument();
    expect(screen.getAllByTitle(/54.*000.*000 so‘m/).length).toBeGreaterThan(0);
    expect(screen.getByText('Doimiy xarajatlar')).toBeInTheDocument();
    expect(screen.getByText('O‘zgaruvchan xarajatlar')).toBeInTheDocument();
    expect(screen.getAllByText('Sayxun').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Xalqlar do‘stligi').length).toBeGreaterThan(0);
    expect(screen.queryByText('Filiallar bo‘yicha taqqoslash')).not.toBeInTheDocument();
    expect(screen.queryByText('Filiallar kesimidagi jami')).not.toBeInTheDocument();
  });

  it('so‘rov kutilayotganda loading state ko‘rsatadi', async () => {
    vi.mocked(reportApi.expensePlan).mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(await screen.findByText('Xarajatlar rejasi yuklanmoqda…')).toBeInTheDocument();
  });

  it('applicable budjet rejasi bo‘lmasa aniq empty state ko‘rsatadi', async () => {
    vi.mocked(reportApi.expensePlan).mockResolvedValue({
      ...data,
      hasPlan: false,
      summary: {
        fixedPlanUzs: '0',
        variablePlanUzs: '0',
        totalPlanUzs: '0',
        branchCount: 2,
      },
      branches: data.branches.map((branch) => ({
        ...branch,
        hasPlan: false,
        fixedPlanUzs: '0',
        variablePlanUzs: '0',
        totalPlanUzs: '0',
      })),
    });

    renderPage();

    expect(await screen.findByText('Xarajat rejasi mavjud emas')).toBeInTheDocument();
    expect(
      screen.getByText('Tanlangan davr uchun tasdiqlangan xarajat rejasi topilmadi.'),
    ).toBeInTheDocument();
  });

  it('API xatosida qayta urinishli error state ko‘rsatadi', async () => {
    vi.mocked(reportApi.expensePlan).mockRejectedValue(new Error('network'));

    renderPage();

    expect(
      await screen.findByText('Xarajatlar ma’lumotlarini yuklab bo‘lmadi.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Qayta urinish' })).toBeInTheDocument();
  });
});
