import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PermissionRoute, ProtectedRoute } from '@/features/auth/auth-guards';
import { navigation, routes } from '@/shared/config/routes';
import type { PermissionCode } from '@/shared/types/domain';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock('@/features/auth/auth-context', () => ({ useAuth: useAuthMock }));

function authState(overrides: Record<string, unknown> = {}) {
  return {
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasPermission: vi.fn(() => false),
    canAccessBranch: vi.fn(() => false),
    ...overrides,
  };
}

function LoginRedirectProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '';
  return <output data-testid="redirect-from">{from}</output>;
}

describe('[FE-AUTH-03] permission va direct-route himoyasi', () => {
  it('sessiyasiz direct URLni login sahifasiga original filteri bilan qaytaradi', () => {
    useAuthMock.mockReturnValue(authState());

    render(
      <MemoryRouter initialEntries={['/admin/roles?period=august&branch=sayxun']}>
        <Routes>
          <Route path={routes.login} element={<LoginRedirectProbe />} />
          <Route element={<ProtectedRoute />}>
            <Route path={routes.roles} element={<h1>Rollar</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('redirect-from')).toHaveTextContent(
      '/admin/roles?period=august&branch=sayxun',
    );
  });

  it('ruxsatsiz autentifikatsiyalangan userga direct sahifa kontentini bermaydi', () => {
    useAuthMock.mockReturnValue(
      authState({
        isAuthenticated: true,
        hasPermission: vi.fn(() => false),
      }),
    );

    render(
      <MemoryRouter initialEntries={[routes.roles]}>
        <Routes>
          <Route element={<PermissionRoute permission="role.manage" />}>
            <Route path={routes.roles} element={<h1>Maxfiy rollar</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Ruxsat yo‘q' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Maxfiy rollar' })).not.toBeInTheDocument();
  });

  it('permission mavjud bo‘lsa nested route kontentini ko‘rsatadi', () => {
    useAuthMock.mockReturnValue(
      authState({
        isAuthenticated: true,
        hasPermission: vi.fn((permission: PermissionCode) => permission === 'role.manage'),
      }),
    );

    render(
      <MemoryRouter initialEntries={[routes.roles]}>
        <Routes>
          <Route element={<PermissionRoute permission="role.manage" />}>
            <Route path={routes.roles} element={<h1>Rollar ochildi</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Rollar ochildi' })).toBeInTheDocument();
  });

  it('cashier navigatsiyasidan admin bo‘limlarini chiqarib tashlaydi', () => {
    const cashierPermissions: PermissionCode[] = [
      'dashboard.view',
      'expense.view_own_branch',
      'expense.create',
      'reports.view',
    ];
    const visibleLabels = navigation
      .flatMap((group) => group.items)
      .filter((item) => cashierPermissions.includes(item.permission))
      .map((item) => item.label);

    expect(visibleLabels).toContain('Dashboard');
    expect(visibleLabels).toContain('Jurnal');
    expect(visibleLabels).not.toContain('Rollar');
    expect(visibleLabels).not.toContain('Foydalanuvchilar');
  });
});
