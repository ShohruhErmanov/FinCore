import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import type { AuthenticatedUser, UserStatus } from '@/shared/types/domain';
import { Button, ConfirmDialog, Select, useToast } from '@/shared/ui';

export function UserStatusAction({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: UserStatus) => adminApi.updateUserStatus(user.id, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users }),
        queryClient.invalidateQueries({ queryKey: queryKeys.userDirectory }),
      ]);
    },
  });
  return (
    <Select
      aria-label={`${user.fullName} holati`}
      className="min-w-32"
      value={user.status}
      disabled={mutation.isPending}
      onChange={(event) => mutation.mutate(event.target.value as UserStatus)}
    >
      <option value="active">Faol</option>
      <option value="inactive">Nofaol</option>
      <option value="blocked">Bloklangan</option>
    </Select>
  );
}

export function DeleteUserAction({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => adminApi.deleteUser(user.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users }),
        queryClient.invalidateQueries({ queryKey: queryKeys.userDirectory }),
      ]);
      setOpen(false);
    },
    onError: (error) =>
      notify({
        title: 'User o‘chirilmadi',
        message: getApiErrorMessage(error),
        tone: 'danger',
      }),
  });
  return (
    <>
      <Button
        size="sm"
        variant="danger"
        aria-label={`${user.fullName}ni o‘chirish`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" /> O‘chirish
      </Button>
      <ConfirmDialog
        open={open}
        title="Foydalanuvchini butunlay o‘chirish"
        description={`${user.fullName} foydalanuvchisi butunlay o‘chiriladi. Davom etasizmi?`}
        confirmLabel="Butunlay o‘chirish"
        danger
        pending={mutation.isPending}
        onClose={() => {
          if (!mutation.isPending) setOpen(false);
        }}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}

export function UserStatusBadge({ value }: { value: UserStatus }) {
  const label = value === 'active' ? 'Faol' : value === 'inactive' ? 'Nofaol' : 'Bloklangan';
  const style =
    value === 'active'
      ? 'bg-green-50 text-green-800'
      : value === 'inactive'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-red-50 text-red-800';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}
