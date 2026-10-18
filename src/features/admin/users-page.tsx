import { useQuery } from '@tanstack/react-query';
import { CirclePlus, KeyRound, Lock } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime } from '@/shared/lib/format';
import type { AuthenticatedUser } from '@/shared/types/domain';
import {
  Alert,
  Button,
  Card,
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
  type Column,
} from '@/shared/ui';
import { isBusinessOwner } from './user-access';
import { DeleteUserAction, UserStatusAction, UserStatusBadge } from './user-row-actions';
import { CreateUserPanel } from './create-user-panel';
import { UserAccessDialog } from './user-access-dialog';

export function UsersPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const canDeactivateUsers = hasPermission('user.deactivate');
  const canDeleteUsers = hasPermission('user.delete');
  const branchesQuery = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
    staleTime: 300_000,
  });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 300_000,
  });
  const paymentMethodsQuery = useQuery({
    queryKey: queryKeys.master('payment-methods'),
    queryFn: ({ signal }) => referenceApi.paymentMethods(signal),
    staleTime: 300_000,
  });
  const users = useQuery({
    queryKey: queryKeys.users,
    queryFn: ({ signal }) => adminApi.users(signal),
  });
  const [creating, setCreating] = useState(false);
  const [editingAccess, setEditingAccess] = useState<AuthenticatedUser | null>(null);
  const actorIsBusinessOwner = currentUser ? isBusinessOwner(currentUser) : false;
  /**
   * A Business Owner account is managed by a Business Owner only — the server
   * refuses anyone else (BUSINESS_OWNER_PROTECTED), so a director is not shown
   * controls that could only fail. Its password is its owner's alone.
   */
  const lockedFor = (row: AuthenticatedUser) => isBusinessOwner(row) && !actorIsBusinessOwner;
  const columns: Column<AuthenticatedUser>[] = [
    {
      key: 'user',
      header: 'Foydalanuvchi',
      cell: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.fullName}</p>
          <p className="text-xs text-muted">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Rol va filial scope',
      cell: (row) => (
        <div className="space-y-1">
          {row.roles.map((role) => (
            <p key={role.id} className="text-sm">
              <span className="font-medium text-ink">{role.roleName}</span>
              {role.branchName ? ` · ${role.branchName}` : ' · Barcha filiallar'}
            </p>
          ))}
        </div>
      ),
    },
    { key: 'status', header: 'Holat', cell: (row) => <UserStatusBadge value={row.status} /> },
    {
      key: 'lastLogin',
      header: 'Oxirgi kirish',
      cell: (row) =>
        row.lastLoginAt ? (
          <time className="whitespace-nowrap text-xs">{formatDateTime(row.lastLoginAt)}</time>
        ) : (
          'Hech qachon'
        ),
    },
    {
      key: 'permissions',
      header: 'Permission',
      cell: (row) => <span className="tabular-nums">{row.permissions.length}</span>,
    },
    {
      key: 'action',
      header: '',
      cell: (row) =>
        lockedFor(row) ? (
          <div className="flex min-w-52 items-center justify-end">
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
              title="Biznes egasi hisobini faqat Biznes egasi boshqaradi"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Himoyalangan
            </span>
          </div>
        ) : (
          <div className="flex min-w-52 items-center justify-end gap-2">
            {canDeactivateUsers && currentUser?.id !== row.id ? (
              <UserStatusAction user={row} />
            ) : null}
            {canDeleteUsers && currentUser?.id !== row.id ? <DeleteUserAction user={row} /> : null}
            {/* Another owner's dialog would hold only a password form the
                server refuses, so it is not offered. */}
            {isBusinessOwner(row) && currentUser?.id !== row.id ? null : (
              <Button
                size="sm"
                variant="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingAccess(row);
                }}
              >
                <KeyRound className="h-4 w-4" /> Access
              </Button>
            )}
          </div>
        ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Foydalanuvchilar"
        description="User holati, bir nechta rol va filial scope’larini xavfsiz projection orqali boshqarish."
        actions={
          <Button onClick={() => setCreating((value) => !value)}>
            <CirclePlus className="h-4 w-4" />
            Yangi user
          </Button>
        }
      />
      <Alert title="Permission serverdan olinadi" tone="info" className="mb-5">
        Frontend role nomidan permission yasamaydi. Har login va mutation backend scope tekshiruviga
        tayanadi.
      </Alert>
      {creating ? (
        <CreateUserPanel
          branches={branchesQuery.data ?? []}
          periods={periodsQuery.data ?? []}
          paymentMethods={paymentMethodsQuery.data ?? []}
          canCreateInvestor={Boolean(currentUser?.roles.some((item) => item.role === 'director'))}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editingAccess ? (
        <UserAccessDialog
          key={editingAccess.id}
          user={editingAccess}
          self={currentUser?.id === editingAccess.id}
          branches={branchesQuery.data ?? []}
          onClose={() => setEditingAccess(null)}
        />
      ) : null}
      {users.isLoading ? (
        <LoadingState label="Foydalanuvchilar yuklanmoqda…" />
      ) : users.isError ? (
        <ErrorState
          message={getApiErrorMessage(users.error)}
          onRetry={() => void users.refetch()}
        />
      ) : (
        <Card>
          <DataTable
            columns={columns}
            rows={users.data ?? []}
            caption="Foydalanuvchilar, rollar va filial scope’lari"
          />
        </Card>
      )}
    </>
  );
}
