import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetPage } from '@/features/budgets/BudgetPages';
import { authApi, budgetApi, referenceApi } from '@/shared/api/contracts';
import type { AuthenticatedUser, BudgetHistory, BudgetPlan } from '@/shared/types/domain';

vi.mock('@/shared/api/contracts', () => ({
  authApi: { me: vi.fn() },
  budgetApi: { get: vi.fn(), history: vi.fn(), saveLines: vi.fn() },
  referenceApi: { periods: vi.fn() },
}));

const PERIOD = '20000000-0000-4000-8000-000000000008';
const JANUARY_PERIOD = '20000000-0000-4000-8000-000000000001';
const SAYXUN = '10000000-0000-4000-8000-000000000001';
const XALQLAR = '10000000-0000-4000-8000-000000000002';
const RENT = '60000000-0000-4000-8000-000000000001';

const me = {
  id: '30000000-0000-4000-8000-000000000001',
  fullName: 'Direktor',
  phone: '+998900000000',
  status: 'active',
  roles: [],
  permissions: ['budget.view', 'budget.create_edit'],
  branchScopes: [SAYXUN, XALQLAR],
  writeBranchScopes: [SAYXUN, XALQLAR],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
} satisfies AuthenticatedUser;

const plan: BudgetPlan = {
  id: '21000000-0000-4000-8000-000000000008',
  periodId: PERIOD,
  periodLabel: 'Avgust 2026',
  updatedAt: '2026-08-01T09:00:00+05:00',
  updatedByName: 'Direktor',
  lines: [
    {
      id: 'line-sayxun',
      branchId: SAYXUN,
      branchName: 'Sayxun',
      categoryId: RENT,
      categoryCodeSnapshot: 'RENT',
      categoryNameSnapshot: 'Ijara (bino arendasi)',
      expenseTypeSnapshot: 'fixed',
      plannedAmountUzs: '7200000',
      actualAmountUzs: '7000000',
      varianceUzs: '200000',
      hasPlan: true,
      reason: 'Ijara shartnomasi',
    },
    {
      id: 'line-xalqlar',
      branchId: XALQLAR,
      branchName: 'Xalqlar do‘stligi',
      categoryId: RENT,
      categoryCodeSnapshot: 'RENT',
      categoryNameSnapshot: 'Ijara (bino arendasi)',
      expenseTypeSnapshot: 'fixed',
      plannedAmountUzs: '20000000',
      actualAmountUzs: '16680000',
      varianceUzs: '3320000',
      hasPlan: true,
      reason: 'Ijara shartnomasi',
    },
  ],
};

const history: BudgetHistory = {
  year: 2026,
  branches: [
    { id: SAYXUN, code: 'SAYXUN', name: 'Sayxun', isActive: true },
    { id: XALQLAR, code: 'XALQLAR', name: 'Xalqlar do‘stligi', isActive: true },
  ],
  periods: [
    {
      periodId: JANUARY_PERIOD,
      year: 2026,
      month: 1,
      periodLabel: 'Yanvar 2026',
      periodStatus: 'open',
      budgetVersionId: null,
      revisionNo: null,
      versionStatus: null,
      versionReason: null,
      updatedAt: null,
      updatedByName: '',
      rows: [],
      totalsByBranch: [],
      totalPlannedAmountUzs: null,
    },
    {
      periodId: PERIOD,
      year: 2026,
      month: 8,
      periodLabel: 'Avgust 2026',
      periodStatus: 'open',
      budgetVersionId: plan.id,
      revisionNo: 2,
      versionStatus: 'approved',
      versionReason: 'Tasdiqlangan avgust budjeti',
      updatedAt: plan.updatedAt,
      updatedByName: 'Direktor',
      rows: [
        {
          categoryId: RENT,
          categoryCodeSnapshot: 'RENT',
          categoryNameSnapshot: 'Ijara (bino arendasi)',
          expenseTypeSnapshot: 'fixed',
          branches: [
            {
              branchId: SAYXUN,
              branchName: 'Sayxun',
              plannedAmountUzs: '7200000',
              hasPlan: true,
              reason: 'Ijara shartnomasi',
            },
            {
              branchId: XALQLAR,
              branchName: 'Xalqlar do‘stligi',
              plannedAmountUzs: '20000000',
              hasPlan: true,
              reason: 'Ijara shartnomasi',
            },
          ],
          totalPlannedAmountUzs: '27200000',
          reason: 'Ijara shartnomasi',
        },
      ],
      totalsByBranch: [
        {
          branchId: SAYXUN,
          branchName: 'Sayxun',
          plannedAmountUzs: '7200000',
          hasPlan: true,
          reason: null,
        },
        {
          branchId: XALQLAR,
          branchName: 'Xalqlar do‘stligi',
          plannedAmountUzs: '20000000',
          hasPlan: true,
          reason: null,
        },
      ],
      totalPlannedAmountUzs: '27200000',
    },
  ],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/budgets?period=${PERIOD}&branch=all`]}>
        <Link to={`/budgets?period=${JANUARY_PERIOD}&branch=all`}>Navbar: Yanvar</Link>
        <BudgetPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Budjet tarixi — Excel Budjet_tarixi parity', () => {
  beforeEach(() => {
    vi.mocked(authApi.me).mockResolvedValue(me);
    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: JANUARY_PERIOD,
        year: 2026,
        month: 1,
        label: 'Yanvar 2026',
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
      {
        id: PERIOD,
        year: 2026,
        month: 8,
        label: 'Avgust 2026',
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
    ]);
    vi.mocked(budgetApi.get).mockResolvedValue(plan);
    vi.mocked(budgetApi.history).mockResolvedValue(history);
    vi.mocked(budgetApi.saveLines).mockResolvedValue(plan);
  });

  it('navbar davridan faqat tanlangan oy tarixini ko‘rsatadi va oy almashganda blokni yangilaydi', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Budjet tarixi')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tarix yili')).not.toBeInTheDocument();
    const historyTable = await screen.findByRole('table', {
      name: 'Avgust 2026 budjet tarixi',
    });
    expect(
      screen.queryByRole('table', { name: 'Yanvar 2026 budjet tarixi' }),
    ).not.toBeInTheDocument();
    expect(
      within(historyTable).getByRole('columnheader', { name: 'Sayxun reja' }),
    ).toBeInTheDocument();
    expect(
      within(historyTable).getByRole('columnheader', { name: 'Xalqlar do‘stligi reja' }),
    ).toBeInTheDocument();
    expect(
      within(historyTable).getByRole('columnheader', { name: 'Jami reja' }),
    ).toBeInTheDocument();
    expect(within(historyTable).getByText('Ijara shartnomasi')).toBeInTheDocument();
    expect(screen.getByText('Filial × kategoriya matritsasi')).toBeInTheDocument();

    expect(screen.queryByText('Hisob davri')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Navbar: Yanvar' }));

    expect(
      await screen.findByRole('table', { name: 'Yanvar 2026 budjet tarixi' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Avgust 2026 budjet tarixi' }),
    ).not.toBeInTheDocument();
  });

  it('izoh/sababni budjet summasi bilan birga backendga yuboradi', async () => {
    const user = userEvent.setup();
    renderPage();

    const reason = await screen.findByLabelText('Sayxun, Ijara (bino arendasi) izoh yoki sabab');
    await user.clear(reason);
    await user.type(reason, 'Yangilangan ijara sababi');
    await user.click(screen.getByRole('button', { name: /Saqlash/i }));

    expect(budgetApi.saveLines).toHaveBeenCalledWith(
      PERIOD,
      expect.arrayContaining([
        expect.objectContaining({
          branchId: SAYXUN,
          categoryId: RENT,
          plannedAmountUzs: '7200000',
          reason: 'Yangilangan ijara sababi',
        }),
      ]),
    );
  });
});
