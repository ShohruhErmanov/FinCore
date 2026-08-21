import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { branches, dashboard, ids, periods, users } from '@/mocks/fixtures';
import { dashboardApi, referenceApi } from '@/shared/api/contracts';
import { routes } from '@/shared/config/routes';
import type { PermissionCode } from '@/shared/types/domain';

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
    BarChart: Container,
    CartesianGrid: Container,
    Legend: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
    Bar: Container,
  };
});

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
          <Route path={routes.revenueTransactions} element={<LocationProbe />} />
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
    vi.mocked(dashboardApi.get).mockResolvedValue(dashboard);
  });

  it('300m/180m/60% va alohida 70m sof natijani API javobidan render qiladi', async () => {
    renderDashboard();

    expect(await screen.findByText("300 mln so'm")).toBeInTheDocument();
    expect(screen.getByText("180 mln so'm")).toBeInTheDocument();
    expect(screen.getByText('Yig‘im darajasi 60%')).toBeInTheDocument();
    expect(screen.getByText("70 mln so'm")).toBeInTheDocument();
    expect(screen.getByText('Sof moliyaviy natija')).toBeInTheDocument();
  });

  it('KPI drill-down canonical period va branch filterlarini URLda saqlaydi', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const actualRevenue = await screen.findByRole('link', {
      name: /Sof tushgan pul/,
    });
    await user.click(actualRevenue);

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      `${routes.revenueTransactions}?period=${ids.periodAug}&branch=all`,
    );
  });
});
