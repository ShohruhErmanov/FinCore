import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesPage } from '@/features/admin/roles-page';
import { adminApi } from '@/shared/api/contracts';

vi.mock('@/shared/api/contracts', () => ({
  adminApi: { rolePermissions: vi.fn(), updateRolePermissions: vi.fn() },
}));

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RolesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RolesPage', () => {
  /**
   * Regression: the client-side roleNames map listed a role the database did
   * not have yet, and the tab strip read matrix[role].length on it. The page
   * crashed to the error boundary the moment the server matrix arrived.
   */
  it('survives a server matrix that omits a role the client knows about', async () => {
    vi.mocked(adminApi.rolePermissions).mockResolvedValue({
      cashier: ['dashboard.view'],
      finance_manager: ['dashboard.view', 'budget.view'],
      director: ['dashboard.view', 'role.manage'],
      // 'investor' is deliberately absent — the migration adding it is unapplied.
    } as never);

    renderPage();

    // The local seed briefly shows Investor; once the server matrix lands, the
    // tab must disappear rather than crash on matrix['investor'].length.
    //
    // Scoped to the tab, not the document: 'Investor' is also the name of a
    // permission group, which is present whatever roles the server reports.
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: 'Investor' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Kassir')).toBeInTheDocument();
    expect(screen.getByText('Direktor')).toBeInTheDocument();
    // …and nothing crashed on the way.
    expect(screen.getByText('Rollar va permissionlar')).toBeInTheDocument();
  });

  it('shows a role the server reports even without a local label', async () => {
    vi.mocked(adminApi.rolePermissions).mockResolvedValue({
      cashier: ['dashboard.view'],
      auditor: ['reports.view'],
    } as never);

    renderPage();

    // Falls back to the role code rather than rendering "undefined".
    await waitFor(() => expect(screen.getByText('auditor')).toBeInTheDocument());
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('moves the selection off a role the server dropped', async () => {
    vi.mocked(adminApi.rolePermissions).mockResolvedValue({
      finance_manager: ['budget.view'],
    } as never);

    renderPage();

    // 'cashier' is the initial selection but is absent from the server matrix,
    // so the page falls back to the first role it actually has.
    await waitFor(() =>
      expect(screen.getByText('Moliya rahbari permissionlari')).toBeInTheDocument(),
    );
  });

  it('still lets a permission be toggled after the fallback', async () => {
    vi.mocked(adminApi.rolePermissions).mockResolvedValue({
      director: ['dashboard.view'],
    } as never);

    renderPage();

    // "Direktor" is in the local seed too, so waiting for the tab would race the
    // request. The panel heading only says Direktor once the server matrix has
    // landed AND the selection has fallen back off the absent 'cashier'.
    await waitFor(() => expect(screen.getByText('Direktor permissionlari')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox', { name: /Dashboardni ko‘rish/ });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('renders before the server responds, using the local seed', () => {
    vi.mocked(adminApi.rolePermissions).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Rollar va permissionlar')).toBeInTheDocument();
    expect(screen.getByText('Kassir')).toBeInTheDocument();
  });

  it('shows Business Owner permissions but never allows editing them', async () => {
    vi.mocked(adminApi.rolePermissions).mockResolvedValue({
      business_owner: ['dashboard.view', 'reports.view', 'audit.view'],
    } as never);

    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: /Biznes egasi/ }));
    expect(screen.getByText(/himoyalangan read-only rol/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /O‘zgarishlarni saqlash/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Dashboardni ko‘rish/ })).toBeDisabled();
  });
});
