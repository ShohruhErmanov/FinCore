import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/app/layout/app-shell';
import { referenceApi } from '@/shared/api/contracts';
import type { AccountingPeriod } from '@/shared/types/domain';
import { ToastProvider } from '@/shared/ui';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('@/features/auth/auth-context', () => ({ useAuth: mocks.useAuth }));

const period = (year: number, month: number): AccountingPeriod => ({
  id: `${year}-${String(month).padStart(2, '0')}`,
  year,
  month,
  label: `${month}.${year}`,
  status: 'open',
  closedAt: null,
  closedByName: null,
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Joriy URL">{`${location.pathname}${location.search}`}</output>;
}

function renderShell(initialPeriods: AccountingPeriod[], refreshedPeriods = initialPeriods) {
  vi.spyOn(referenceApi, 'periods')
    .mockResolvedValueOnce(initialPeriods)
    .mockResolvedValue(refreshedPeriods);
  vi.spyOn(referenceApi, 'branches').mockResolvedValue([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<LocationProbe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('global accounting year selector', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.useAuth.mockReturnValue({
      user: {
        id: 'director-1',
        fullName: 'Ergashev Abdulla',
        phone: '+998900000000',
        status: 'active',
        roles: [{ roleName: 'Direktor' }],
        permissions: ['master_data.manage', 'expense.view_all_branches'],
        branchScopes: [],
        writeBranchScopes: [],
        fixedSalaryUzs: '0',
        lastLoginAt: null,
      },
      logout: vi.fn(),
      hasPermission: (permission: string) =>
        ['master_data.manage', 'expense.view_all_branches'].includes(permission),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('lists every real year and preserves the selected month when switching', async () => {
    const user = userEvent.setup();
    renderShell([period(2027, 8), period(2026, 8)]);

    const yearSelect = await screen.findByLabelText('Hisobot yili');
    expect(screen.getByRole('option', { name: '2027' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2026' })).toBeInTheDocument();

    await user.selectOptions(yearSelect, '2026');

    await waitFor(() =>
      expect(screen.getByLabelText('Joriy URL')).toHaveTextContent('period=2026-08'),
    );
  });

  it('creates a full year, selects its matching month and exposes it immediately', async () => {
    const user = userEvent.setup();
    const created = Array.from({ length: 12 }, (_, index) => period(2027, index + 1));
    const create = vi.spyOn(referenceApi, 'createAccountingYear').mockResolvedValue(created);
    renderShell([period(2026, 8)], [...created, period(2026, 8)]);

    await user.click(await screen.findByRole('button', { name: 'Yangi yil qo‘shish' }));
    expect(
      screen.getByRole('dialog', { name: 'Yangi hisobot yilini qo‘shish' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yilni qo‘shish' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(2027));
    await waitFor(() =>
      expect(screen.getByLabelText('Joriy URL')).toHaveTextContent('period=2027-08'),
    );
    expect(screen.getByRole('option', { name: '2027' })).toBeInTheDocument();
  });

  it('does not show year management to users without master-data permission', async () => {
    mocks.useAuth.mockReturnValue({
      ...mocks.useAuth(),
      hasPermission: () => false,
    });
    renderShell([period(2026, 8)]);

    expect(await screen.findByLabelText('Hisobot yili')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yangi yil qo‘shish' })).not.toBeInTheDocument();
  });
});
