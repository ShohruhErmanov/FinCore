import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RevenuePlanPage } from '@/features/revenue/RevenuePages';
import { authApi, referenceApi, revenueApi } from '@/shared/api/contracts';
import { tashkentBusinessDate } from '@/shared/lib/format';

vi.mock('@/shared/api/contracts', () => ({
  authApi: { me: vi.fn() },
  referenceApi: { periods: vi.fn() },
  revenueApi: {
    plan: vi.fn(),
    planYear: vi.fn(),
    savePlan: vi.fn(),
  },
}));

vi.mock('@/features/revenue/revenue-plan-year', () => ({
  RevenuePlanYearOverview: () => null,
}));

const CURRENT_PERIOD_ID = '20000000-0000-4000-8000-000000000001';
const FUTURE_PERIOD_ID = '20000000-0000-4000-8000-000000000002';

function LocationSearch() {
  return <output aria-label="current search">{useLocation().search}</output>;
}

describe('Tushum rejasi davri', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const businessDate = tashkentBusinessDate();
    const currentYear = Number(businessDate.slice(0, 4));
    const currentMonth = Number(businessDate.slice(5, 7));

    vi.mocked(authApi.me).mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001',
      fullName: 'Director',
      phone: '+998900000000',
      status: 'active',
      roles: [],
      permissions: ['revenue_plan.manage'],
      branchScopes: [],
      writeBranchScopes: [],
      fixedSalaryUzs: '0',
      lastLoginAt: null,
    });
    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: FUTURE_PERIOD_ID,
        year: currentYear + 1,
        month: 12,
        label: `Dekabr ${currentYear + 1}`,
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
      {
        id: CURRENT_PERIOD_ID,
        year: currentYear,
        month: currentMonth,
        label: `${currentMonth} / ${currentYear}`,
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
    ]);
    vi.mocked(revenueApi.plan).mockResolvedValue({
      id: '30000000-0000-4000-8000-000000000001',
      periodId: CURRENT_PERIOD_ID,
      periodLabel: `${currentMonth} / ${currentYear}`,
      daysInMonth: 31,
      updatedAt: '2026-10-10T00:00:00.000Z',
      updatedByName: 'Director',
      lines: [],
    });
  });

  it('future open periods come first even then current Tashkent month is selected', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/revenue-plans']}>
          <RevenuePlanPage />
          <LocationSearch />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(revenueApi.plan).toHaveBeenCalledWith(CURRENT_PERIOD_ID, expect.anything()),
    );
    expect(revenueApi.plan).not.toHaveBeenCalledWith(FUTURE_PERIOD_ID, expect.anything());
    await waitFor(() =>
      expect(screen.getByLabelText('current search')).toHaveTextContent(
        `period=${CURRENT_PERIOD_ID}`,
      ),
    );
  });
});
