import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState, AccessDenied } from '@/shared/ui';
import type { PermissionCode } from '@/shared/types/domain';
import { routes } from '@/shared/config/routes';
import { useAuth } from './auth-context';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading)
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="w-full max-w-xl">
          <LoadingState label="Sessiya tekshirilmoqda…" />
        </div>
      </main>
    );
  if (!auth.isAuthenticated)
    return (
      <Navigate
        to={routes.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  return <Outlet />;
}

/** `permission` ro‘yxat bo‘lsa — kamida bittasi yetarli. */
export function PermissionRoute({
  permission,
}: {
  permission: PermissionCode | PermissionCode[];
}) {
  const { hasPermission } = useAuth();
  const allowed = Array.isArray(permission)
    ? permission.some((code) => hasPermission(code))
    : hasPermission(permission);
  return allowed ? <Outlet /> : <AccessDenied />;
}
