import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { authApi } from '@/shared/api/contracts';
import { ApiError } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import type { AuthenticatedUser, PermissionCode } from '@/shared/types/domain';

interface LoginInput {
  login: string;
  password: string;
}

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  hasPermission: (permission: PermissionCode) => boolean;
  canAccessBranch: (branchId: string) => boolean;
  canWriteBranch: (branchId: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => authApi.me(signal),
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 1,
    staleTime: 60_000,
  });
  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  });
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.me, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    },
  });
  const user = me.data ?? null;
  const hasPermission = useCallback(
    (permission: PermissionCode) => user?.permissions.includes(permission) ?? false,
    [user],
  );
  const canAccessBranch = useCallback(
    (branchId: string) => user?.branchScopes.includes(branchId) ?? false,
    [user],
  );
  const canWriteBranch = useCallback(
    (branchId: string) => user?.writeBranchScopes.includes(branchId) ?? false,
    [user],
  );
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: me.isLoading,
      isAuthenticated: Boolean(user),
      login: loginMutation.mutateAsync,
      logout: logoutMutation.mutateAsync,
      hasPermission,
      canAccessBranch,
      canWriteBranch,
    }),
    [
      canAccessBranch,
      canWriteBranch,
      hasPermission,
      loginMutation.mutateAsync,
      logoutMutation.mutateAsync,
      me.isLoading,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth faqat AuthProvider ichida ishlatiladi.');
  return value;
}
