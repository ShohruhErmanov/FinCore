import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isNavItemActive, landingRoute, navigation, routes } from '@/shared/config/routes';
import type { PermissionCode } from '@/shared/types/domain';
import { UsersPage } from '@/features/admin/users-page';
import { adminApi, referenceApi } from '@/shared/api/contracts';

vi.mock('@/shared/api/contracts', () => ({
  adminApi: {
    users: vi.fn(),
    createUser: vi.fn(),
    updateUserAccess: vi.fn(),
    updateUserStatus: vi.fn(),
    updateUserSalary: vi.fn(),
    deleteUser: vi.fn(),
  },
  referenceApi: { branches: vi.fn(), periods: vi.fn(), paymentMethods: vi.fn() },
}));

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    user: { id: 'director', roles: [{ role: 'director' }] },
  }),
}));

const holder =
  (...codes: PermissionCode[]) =>
  (code: PermissionCode) =>
    codes.includes(code);

describe('landingRoute', () => {
  it('sends an investor to their own page, not the dashboard they cannot open', () => {
    expect(landingRoute(holder('investor.view_own'))).toBe(routes.myInvestment);
  });

  it('keeps every other role on the dashboard', () => {
    expect(landingRoute(holder('dashboard.view', 'expense.view_own_branch'))).toBe(
      routes.dashboard,
    );
    // A director holds both; the dashboard still wins.
    expect(landingRoute(holder('dashboard.view', 'investor.view_own'))).toBe(routes.dashboard);
  });

  it('falls back to the first page a permission actually opens', () => {
    expect(landingRoute(holder('reports.view'))).toBe(routes.monthlyReport);
  });

  it('never returns an empty destination for a permissionless account', () => {
    expect(landingRoute(() => false)).toBe(routes.dashboard);
  });
});

describe('investor navigation', () => {
  const visibleFor = (has: (code: PermissionCode) => boolean) =>
    navigation
      .map((group) => ({ ...group, items: group.items.filter((item) => has(item.permission)) }))
      .filter((group) => group.items.length > 0);

  /** Exactly what migration 017 leaves the investor role holding. */
  const INVESTOR: PermissionCode[] = ['investor.view_own', 'investor.settlement.request'];
  const leastPrivilege = (code: PermissionCode) => INVESTOR.includes(code);

  it('shows an investor exactly one item and no admin entry', () => {
    const groups = visibleFor(leastPrivilege);
    const items = groups.flatMap((group) => group.items);

    // One investor page: the share, the payments and the request form on it.
    expect(items.map((item) => item.to)).toEqual([routes.myInvestment]);
    // Nothing from Boshqaruv, Operatsiyalar or Hisobotlar leaks in.
    expect(items.some((item) => item.to === routes.users)).toBe(false);
    expect(items.some((item) => item.to === routes.roles)).toBe(false);
    expect(items.some((item) => item.to === routes.investors)).toBe(false);
  });

  it('offers no revenue, expense, dashboard or report entry', () => {
    // PHASE 49.5: the role held these until migration 017 removed the grants.
    // Hiding a link is not security — the backend refuses these too — but an
    // investor should not be shown a door that will not open.
    const items = visibleFor(leastPrivilege).flatMap((group) => group.items);
    const forbidden = [
      routes.dashboard,
      routes.revenues,
      routes.expenses,
      routes.expenseAnalytics,
      routes.cashierReport,
      routes.monthlyReport,
    ];
    for (const route of forbidden) {
      expect(items.some((item) => item.to === route)).toBe(false);
    }
  });

  it('lands the investor on their own share, not on a dashboard they cannot open', () => {
    expect(landingRoute(leastPrivilege)).toBe(routes.myInvestment);
  });

  it('marks the investor landing page exact so the share child route is not highlighted twice', () => {
    const ownProfile = navigation
      .flatMap((group) => group.items)
      .find((item) => item.to === routes.myInvestment);

    expect(ownProfile?.exact).toBe(true);
  });

  it('keeps the director list behind investor.view_all, not the investor page', () => {
    const director = visibleFor(holder('investor.view_all')).flatMap((group) => group.items);
    expect(director.map((item) => item.to)).toContain(routes.investors);
    expect(director.map((item) => item.to)).not.toContain(routes.myInvestment);
  });

  it('shows the Business Owner strategic read surfaces without management actions', () => {
    const ownerPermissions: PermissionCode[] = [
      'dashboard.view',
      'expense.view_own_branch',
      'expense.view_all_branches',
      'budget.view',
      'revenue.view_own_branch',
      'revenue.view_all_branches',
      'reports.view',
      'investor.view_all',
      'audit.view',
    ];
    const items = visibleFor(holder(...ownerPermissions)).flatMap((group) => group.items);
    const paths = items.map((item) => item.to);

    expect(paths).toEqual(
      expect.arrayContaining([
        routes.dashboard,
        routes.revenues,
        routes.expenses,
        routes.budgets,
        routes.monthlyReport,
        routes.branchReport,
        routes.investors,
        routes.payoutRequests,
        routes.auditLogs,
      ]),
    );
    expect(paths).not.toEqual(
      expect.arrayContaining([
        routes.revenueNew,
        routes.revenuePlans,
        routes.users,
        routes.roles,
        routes.categories,
        routes.imports,
        routes.notifications,
      ]),
    );
  });

  it('does not highlight the investor list on its sibling payout route', () => {
    // This used to need exact: true on the list. isNavItemActive now yields to
    // the more specific entry, which also lets an investor's detail page keep
    // the list highlighted instead of highlighting nothing.
    const items = navigation.flatMap((group) => group.items);
    const lit = (path: string) =>
      items.filter((item) => isNavItemActive(item, path)).map((item) => item.label);

    expect(lit(routes.payoutRequests)).toEqual(['To‘lov so‘rovlari']);
    expect(lit(routes.investors)).toEqual(['Investorlar']);
    expect(lit(routes.investorDetail('44444444-0000-4000-8000-000000000001'))).toEqual([
      'Investorlar',
    ]);
  });
});

describe('Director creates an investor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.users).mockResolvedValue([]);
    vi.mocked(referenceApi.branches).mockResolvedValue([
      { id: 'b1', code: 'SAYXUN', name: 'Sayxun', isActive: true },
    ] as never);
    vi.mocked(referenceApi.periods).mockResolvedValue([
      { id: 'period-8', year: 2026, month: 8, label: 'Avgust 2026', status: 'open' },
    ] as never);
    vi.mocked(referenceApi.paymentMethods).mockResolvedValue([
      { id: 'cash', code: 'CASH', name: 'Naqd pul', isActive: true },
      { id: 'card', code: 'CARD', name: 'Plastik', isActive: true },
      { id: 'bank', code: 'BANK_TRANSFER', name: 'Bank o‘tkazmasi', isActive: true },
    ] as never);
  });

  const open = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Yangi user/i }));
  };

  it('asks for ownership percent only when the role is investor', async () => {
    await open();
    expect(screen.queryByLabelText(/Kompaniyadagi ulush/)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'investor');
    expect(screen.getByLabelText(/Kompaniyadagi ulush/)).toBeInTheDocument();
    // The hint must keep the two percentages apart.
    expect(screen.getByText(/Bu olingan summa foizi emas/)).toBeInTheDocument();
  });

  it('removes investor-only fields when the role changes back', async () => {
    await open();
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'investor');
    expect(screen.getByLabelText(/Investor kiritgan mablag‘/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Qo‘shilish oyi/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'cashier');
    expect(screen.queryByLabelText(/Investor kiritgan mablag‘/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Qo‘shilish oyi/)).not.toBeInTheDocument();
  });

  it('sends ownership percent with the account and never echoes the password', async () => {
    vi.mocked(adminApi.createUser).mockResolvedValue({ id: 'u1' } as never);
    await open();

    await userEvent.type(screen.getByLabelText(/F.I.Sh./), 'Ali Valiyev');
    await userEvent.type(screen.getByLabelText(/^Telefon/), '+998901112233');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'investor');
    await userEvent.type(screen.getByLabelText(/Kompaniyadagi ulush/), '2');
    await userEvent.type(screen.getByLabelText(/Investor kiritgan mablag‘/), '100000000');
    await userEvent.selectOptions(screen.getByLabelText(/Qo‘shilish oyi/), 'period-8');
    await userEvent.click(screen.getByRole('radio', { name: 'Bank o‘tkazmasi' }));
    await userEvent.type(screen.getByLabelText(/^Parol\b/), 'InvestorParol2026');
    await userEvent.type(screen.getByLabelText(/Parolni tasdiqlang/), 'InvestorParol2026');
    await userEvent.click(screen.getByRole('button', { name: /User yaratish/ }));

    await waitFor(() => expect(adminApi.createUser).toHaveBeenCalled());
    const payload = vi.mocked(adminApi.createUser).mock.calls[0]![0];
    expect(payload.role).toBe('investor');
    expect(payload.ownershipPercent).toBe(2);
    expect(payload.capitalAmountUzs).toBe('100000000');
    expect(payload.startPeriodId).toBe('period-8');
    expect(payload.capitalPaymentMethodCode).toBe('BANK_TRANSFER');

    // The password is in the request, and nowhere on screen.
    expect(payload.password).toBe('InvestorParol2026');
    expect(document.body.textContent).not.toContain('InvestorParol2026');
  });

  it('rejects an ownership percent outside 0..100 before calling the API', async () => {
    await open();
    await userEvent.type(screen.getByLabelText(/F.I.Sh./), 'Ali Valiyev');
    await userEvent.type(screen.getByLabelText(/^Telefon/), '+998901112233');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'investor');
    await userEvent.type(screen.getByLabelText(/Kompaniyadagi ulush/), '140');
    await userEvent.type(screen.getByLabelText(/^Parol\b/), 'InvestorParol2026');
    await userEvent.type(screen.getByLabelText(/Parolni tasdiqlang/), 'InvestorParol2026');
    await userEvent.click(screen.getByRole('button', { name: /User yaratish/ }));

    expect(await screen.findByText(/Ulush 0 va 100 foiz orasida/)).toBeInTheDocument();
    expect(adminApi.createUser).not.toHaveBeenCalled();
  });

  it('keeps the password masked until the reveal button is pressed', async () => {
    await open();
    // \b stops this matching "Parolni tasdiqlang".
    const field = screen.getByLabelText(/^Parol\b/);
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Parolni ko‘rsatish' }));
    expect(field).toHaveAttribute('type', 'text');
  });
});

/** PHASE 48 — company-wide is the default; a branch is an option, not a gate. */
describe('Company-wide investor in the create form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.users).mockResolvedValue([]);
    vi.mocked(referenceApi.branches).mockResolvedValue([
      { id: 'b1', code: 'SAYXUN', name: 'Sayxun', isActive: true },
    ] as never);
    vi.mocked(referenceApi.periods).mockResolvedValue([
      { id: 'period-8', year: 2026, month: 8, label: 'Avgust 2026', status: 'open' },
    ] as never);
    vi.mocked(referenceApi.paymentMethods).mockResolvedValue([
      { id: 'cash', code: 'CASH', name: 'Naqd pul', isActive: true },
      { id: 'card', code: 'CARD', name: 'Plastik', isActive: true },
      { id: 'bank', code: 'BANK_TRANSFER', name: 'Bank o‘tkazmasi', isActive: true },
    ] as never);
  });

  const open = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Yangi user/i }));
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'investor');
  };

  it('offers the branch as optional and defaults to the whole company', async () => {
    await open();
    const select = screen.getByLabelText(/Filial \(ixtiyoriy\)/);
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Butun kompaniya' })).toBeInTheDocument();
  });

  it('creates a company-wide investor without a branch', async () => {
    vi.mocked(adminApi.createUser).mockResolvedValue({ id: 'u1' } as never);
    await open();

    await userEvent.type(screen.getByLabelText(/F.I.Sh./), 'Ali Valiyev');
    await userEvent.type(screen.getByLabelText(/^Telefon/), '+998901112233');
    await userEvent.type(screen.getByLabelText(/Kompaniyadagi ulush/), '2');
    await userEvent.type(screen.getByLabelText(/Investor kiritgan mablag‘/), '100000000');
    await userEvent.selectOptions(screen.getByLabelText(/Qo‘shilish oyi/), 'period-8');
    await userEvent.click(screen.getByRole('radio', { name: 'Naqd pul' }));
    await userEvent.type(screen.getByLabelText(/^Parol\b/), 'InvestorParol2026');
    await userEvent.type(screen.getByLabelText(/Parolni tasdiqlang/), 'InvestorParol2026');
    await userEvent.click(screen.getByRole('button', { name: /User yaratish/ }));

    await waitFor(() => expect(adminApi.createUser).toHaveBeenCalled());
    const payload = vi.mocked(adminApi.createUser).mock.calls[0]![0];
    expect(payload.role).toBe('investor');
    expect(payload.ownershipPercent).toBe(2);
    expect(payload.capitalAmountUzs).toBe('100000000');
    expect(payload.startPeriodId).toBe('period-8');
    expect(payload.capitalPaymentMethodCode).toBe('CASH');
    // No branch is sent, and nothing blocked the submission.
    expect(payload.branchId).toBeNull();
  });
});
