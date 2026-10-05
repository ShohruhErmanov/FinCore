import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { branches, ids, periods, users } from '@/mocks/fixtures';
import { dashboardApi, referenceApi } from '@/shared/api/contracts';
import { routes } from '@/shared/config/routes';
import type { DashboardResponse, PermissionCode } from '@/shared/types/domain';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock('@/features/auth/auth-context', () => ({ useAuth: useAuthMock }));
vi.mock('@/shared/api/contracts', () => ({
  dashboardApi: { get: vi.fn() },
  referenceApi: { branches: vi.fn(), periods: vi.fn() },
}));
vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Container,
    AreaChart: Container,
    Area: Container,
    BarChart: Container,
    CartesianGrid: Container,
    Legend: Container,
    Pie: Container,
    PieChart: Container,
    Cell: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
    Bar: Container,
    LineChart: Container,
    Line: Container,
  };
});

const trend = [
  { bucket: '2026-07', label: 'Iyul', planUzs: '280000000', actualUzs: '260000000' },
  { bucket: '2026-08', label: 'Avg', planUzs: '300000000', actualUzs: '186000000' },
];

const dashboardResponse: DashboardResponse = {
  isDemo: true,
  period: periods[0]!,
  branchId: null,
  granularity: 'monthly',
  expensePlanUzs: '125000000',
  expenseActualUzs: '110000000',
  expenseVarianceUzs: '15000000',
  expenseCompletionPct: 88,
  fixedExpenseUzs: '74000000',
  variableExpenseUzs: '36000000',
  expenseTrend: trend,
  revenuePlanUzs: '300000000',
  revenueActualUzs: '186000000',
  revenueVarianceUzs: '-114000000',
  revenueCompletionPct: 62,
  revenueTrend: trend,
  // Two months with data, one of them a loss, so the section has something
  // real to render: a best month, a worst month and a gap.
  revenueGrowth: {
    monthly: {
      month: 8,
      monthLabel: 'Avg',
      previousMonth: 7,
      previousMonthLabel: 'Iyul',
      currentUzs: '50000000',
      previousUzs: '20000000',
      changePct: 150,
      throughDay: null,
    },
    annual: {
      year: 2026,
      previousYear: 2025,
      currentUzs: '70000000',
      previousUzs: '59000000',
      changePct: 18.6,
    },
  },
  annualRevenue: {
    year: 2026,
    totalActualUzs: '70000000',
    totalPlanUzs: '80000000',
    completionPct: 87.5,
    averageMonthlyUzs: '35000000',
    averageMonthsCount: 2,
    peakMonth: { month: 8, label: 'Avg', actualUzs: '50000000' },
    growthPct: 18.7,
    previousYear: 2025,
    previousYearUzs: '59000000',
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      label: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'][
        index
      ]!,
      actualUzs: index === 6 ? '20000000' : index === 7 ? '50000000' : '0',
      planUzs: index === 6 ? '30000000' : index === 7 ? '50000000' : '0',
      completionPct: index === 6 ? 66.67 : index === 7 ? 100 : null,
    })),
  },
  annualNetProfit: {
    year: 2026,
    totalNetProfitUzs: '19000000',
    netMarginPct: 27.14,
    bestMonth: { month: 8, label: 'Avg', netProfitUzs: '24000000' },
    worstMonth: { month: 7, label: 'Iyul', netProfitUzs: '-5000000' },
    monthsWithData: 2,
    months: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const july = month === 7;
      const august = month === 8;
      const hasData = july || august;
      return {
        month,
        label: [
          'Yan',
          'Fev',
          'Mar',
          'Apr',
          'May',
          'Iyun',
          'Iyul',
          'Avg',
          'Sen',
          'Okt',
          'Noy',
          'Dek',
        ][index]!,
        revenueUzs: july ? '20000000' : august ? '50000000' : '0',
        expenseUzs: july ? '25000000' : august ? '26000000' : '0',
        netProfitUzs: july ? '-5000000' : august ? '24000000' : '0',
        changePct: august ? 580 : null,
        comparedToLabel: august ? 'Iyul' : null,
        hasData,
      };
    }),
    paymentMethods: [],
    paymentMethodMonths: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      label: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'][
        index
      ]!,
      totalNetProfitUzs: index === 6 ? '-5000000' : index === 7 ? '24000000' : '0',
      paymentMethods: [],
    })),
  },
  annual: {
    year: 2026,
    totalActualUzs: '170000000',
    fixedActualUzs: '117600000',
    variableActualUzs: '52400000',
    fixedSharePct: 70,
    totalPlanUzs: '202000000',
    varianceUzs: '32000000',
    averageMonthlyUzs: '85000000',
    averageMonthsCount: 2,
    averagePlannedMonthlyUzs: '101000000',
    averagePlanMonthsCount: 2,
    peakMonth: { month: 8, label: 'Avg', actualUzs: '118000000' },
    months: [
      {
        month: 7,
        label: 'Iyul',
        fixedUzs: '35000000',
        variableUzs: '17000000',
        actualUzs: '52000000',
        planUzs: '90000000',
        varianceUzs: '38000000',
        completionPct: 57.78,
      },
      {
        month: 8,
        label: 'Avg',
        fixedUzs: '82600000',
        variableUzs: '35400000',
        actualUzs: '118000000',
        planUzs: '112000000',
        varianceUzs: '-6000000',
        completionPct: 105.36,
      },
    ],
  },
  branches: [
    {
      branchId: ids.sayxun,
      name: 'Sayxun',
      expensePlanUzs: '70000000',
      expenseActualUzs: '65000000',
      expenseCompletionPct: 92.86,
      revenuePlanUzs: '160000000',
      revenueActualUzs: '99000000',
      revenueCompletionPct: 61.88,
    },
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>;
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`${routes.dashboard}?period=${ids.periodAug}&branch=all`]}>
        <Routes>
          <Route path={routes.dashboard} element={<DashboardPage />} />
          <Route path={routes.revenues} element={<LocationProbe />} />
          <Route path={routes.expensePlanAnalytics} element={<LocationProbe />} />
          <Route path={routes.expenseAnalytics} element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('[FE-MSW, AC-14, AC-16] dashboard integration', () => {
  beforeEach(() => {
    const director = users[0]!;
    useAuthMock.mockReturnValue({
      user: director,
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasPermission: (permission: PermissionCode) => director.permissions.includes(permission),
      canAccessBranch: (branchId: string) => director.branchScopes.includes(branchId),
    });
    vi.mocked(referenceApi.branches).mockResolvedValue(branches);
    vi.mocked(referenceApi.periods).mockResolvedValue(periods);
    vi.mocked(dashboardApi.get).mockResolvedValue(dashboardResponse);
  });

  it('tushum va xarajat KPI’larini API javobidan render qiladi', async () => {
    renderDashboard();

    expect(await screen.findByText('300 000 000 so‘m')).toBeInTheDocument();
    expect(screen.getByText('186 000 000 so‘m')).toBeInTheDocument();
    expect(screen.getByText('Reja bajarilishi 62%')).toBeInTheDocument();
    expect(screen.getByText('110 000 000 so‘m')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Reja 125 000 000 so‘m · Rejagacha yetmagan 15 000 000 so‘m · Bajarilish 88%/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Doimiy xarajat')).not.toBeInTheDocument();
    expect(screen.queryByText('O‘zgaruvchan xarajat')).not.toBeInTheDocument();
  });

  it('reja va amaldagi diagrammada jami hamda bajarilishni tushunarli ko‘rsatadi', async () => {
    renderDashboard();

    const revenueChart = await screen.findByRole('region', {
      name: 'Tushum reja va amalda diagrammasi',
    });
    expect(within(revenueChart).getByText('Reja jami')).toBeInTheDocument();
    expect(within(revenueChart).getByText('580 mln')).toBeInTheDocument();
    expect(within(revenueChart).getByText('Amalda jami')).toBeInTheDocument();
    expect(within(revenueChart).getByText('446 mln')).toBeInTheDocument();
    expect(within(revenueChart).getByText('76,89%')).toBeInTheDocument();
  });

  it('Excel «Xulosa» ko‘rsatkichlarini va oylik dinamika jadvalini chiqaradi', async () => {
    renderDashboard();

    expect(await screen.findByText('2026 yil xulosasi')).toBeInTheDocument();
    expect(screen.getByText('Doimiy ulushi')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('O‘rtacha oylik xarajat')).toBeInTheDocument();
    expect(screen.getByText('Fakt mavjud 2 oy bo‘yicha')).toBeInTheDocument();
    expect(screen.getByText('Eng qimmat oy')).toBeInTheDocument();
    // Scoped: the net-profit section below names its best month the same way.
    const summary = screen.getByRole('region', { name: 'Yillik xulosa' });
    expect(within(summary).getByText('Avg oyi')).toBeInTheDocument();
    expect(screen.getByText('Doimiy xarajatlar (yil)')).toBeInTheDocument();
    expect(screen.getByText('O‘zgaruvchan xarajatlar (yil)')).toBeInTheDocument();
    expect(screen.getByText('O‘rtacha kiritilgan oylik reja')).toBeInTheDocument();
    expect(screen.getByText('101 000 000 so‘m')).toBeInTheDocument();
    expect(screen.getByText('Reja mavjud 2 oy bo‘yicha')).toBeInTheDocument();
    expect(screen.getByText('Yillik farq')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Oylik doimiy va o‘zgaruvchan xarajatlar diagrammasi'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Yillik doimiy va o‘zgaruvchan xarajatlar diagrammasi'),
    ).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /oylik dinamika/i });
    expect(table).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'O‘zgaruvchan' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /JAMI/ })).toBeInTheDocument();
  });

  it('kunlik/haftalik/oylik almashtirgichi granularity’ni URL va so‘rovga uzatadi', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Kunlik' }));

    expect(vi.mocked(dashboardApi.get)).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: 'daily' }),
      expect.anything(),
    );
  });

  it('KPI drill-down canonical period va branch filterlarini URLda saqlaydi', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('link', { name: /Amaldagi tushum/ }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      `${routes.revenues}?period=${ids.periodAug}&branch=all`,
    );
  });

  it('Xarajat rejasi kartasi read-only analytics route’ini ochadi', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('link', { name: /Xarajat rejasi/ }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      `${routes.expensePlanAnalytics}?period=${ids.periodAug}&branch=all`,
    );
  });

  it('Jami xarajatlar kartasini saqlaydi va expense analytics route’ini ochadi', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('link', { name: /Jami xarajatlar/ }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      `${routes.expenseAnalytics}?period=${ids.periodAug}&branch=all`,
    );
  });

  it('Cashier uchun sof foyda DOMga render qilinmaydi va Pulse uni qayta hisoblamaydi', async () => {
    const cashier = users[2]!;
    useAuthMock.mockReturnValue({
      user: cashier,
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasPermission: (permission: PermissionCode) => cashier.permissions.includes(permission),
      canAccessBranch: (branchId: string) => cashier.branchScopes.includes(branchId),
    });
    // Defense in depth: even a stale/incorrect response carrying the protected
    // block must not make a Cashier render it. The backend contract test covers
    // the real Network response omission separately.
    vi.mocked(dashboardApi.get).mockResolvedValue(dashboardResponse);

    renderDashboard();

    const pulse = await screen.findByRole('region', { name: 'FinCore Pulse' });
    expect(within(pulse).getByText('186 000 000 so‘m')).toBeInTheDocument();
    expect(within(pulse).queryByText('76 000 000 so‘m')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Oylik sof foyda' })).not.toBeInTheDocument();
    expect(screen.queryByText('Yillik sof foyda')).not.toBeInTheDocument();
    expect(screen.queryByText('Sof foyda')).not.toBeInTheDocument();
    expect(screen.queryByText(/sof foyda dinamikasi/i)).not.toBeInTheDocument();
  });
});
