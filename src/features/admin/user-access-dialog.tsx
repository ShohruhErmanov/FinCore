import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, UserCog } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import type { AuthenticatedUser } from '@/shared/types/domain';
import { Alert, Button, FormField, Input, Modal, Select, useToast } from '@/shared/ui';
import { type AccessModel, accessModelFor } from './user-access';

/**
 * Opened from a row's "Access" button. A dialog rather than a panel: the button
 * sits in a table the director has usually scrolled down, and the old panel
 * rendered above that table, out of sight, so the click looked dead.
 */
export function UserAccessDialog({
  user,
  self,
  branches,
  onClose,
}: {
  user: AuthenticatedUser;
  self: boolean;
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  // The role form only knows cashier / finance manager / director. Opened on an
  // investor it would default to "Kassir" and quietly turn them into one on
  // save, so for these roles it is not offered at all.
  const fixedRole = user.roles.find(
    (role) => role.role === 'investor' || (role.role as string) === 'business_owner',
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`${user.fullName}: access va parol`}
      description="Rol, filial scope va tizimga kirish paroli"
    >
      <div className="space-y-6">
        <section aria-label="Rol va filial">
          <h3 className="mb-3 text-sm font-bold text-ink">Rol va filial</h3>
          {fixedRole ? (
            <p className="neu-inset rounded-lg px-3 py-2 text-sm text-muted">
              {fixedRole.roleName} rolini bu yerda o‘zgartirib bo‘lmaydi. Parolni pastda
              o‘zgartirishingiz mumkin.
            </p>
          ) : (
            <RoleAccessForm user={user} branches={branches} onSaved={onClose} />
          )}
        </section>
        <section aria-label="Parolni o‘zgartirish" className="border-t border-border pt-5">
          <h3 className="text-sm font-bold text-ink">Parolni o‘zgartirish</h3>
          <p className="mb-3 mt-1 text-xs text-muted">
            {self
              ? 'Saqlangach barcha qurilmalardan chiqasiz va yangi parol bilan qayta kirasiz.'
              : 'Saqlangach foydalanuvchi barcha qurilmalardan chiqariladi. Parolni hech kim qayta ko‘ra olmaydi — uni xodimga o‘zingiz yetkazing.'}
          </p>
          <PasswordForm user={user} self={self} onDone={onClose} />
        </section>
      </div>
    </Modal>
  );
}

function PasswordForm({
  user,
  self,
  onDone,
}: {
  user: AuthenticatedUser;
  self: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateUserPassword(user.id, {
        password,
        confirmPassword,
        ...(self ? { currentPassword } : {}),
      }),
    onSuccess: () => {
      // Nothing typed here outlives the request.
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      notify({
        title: 'Parol o‘zgartirildi',
        message: self
          ? 'Yangi parol bilan qayta kiring.'
          : `${user.fullName} barcha qurilmalardan chiqarildi.`,
        tone: 'success',
      });
      // The server ended this very session too; dropping it here opens login.
      if (self) queryClient.setQueryData(queryKeys.me, null);
      else onDone();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (self && !currentPassword) return setError('Joriy parolni kiriting.');
    if (password.length < 12) return setError('Parol kamida 12 belgidan iborat bo‘lsin.');
    if (password !== confirmPassword) return setError('Parol va tasdiqlash mos emas.');
    setError(null);
    mutation.mutate();
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {self ? (
        <FormField label="Joriy parol" htmlFor="access-current-password" required>
          <Input
            id="access-current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </FormField>
      ) : null}
      <FormField label="Yangi parol" htmlFor="access-new-password" required hint="Kamida 12 belgi">
        <div className="relative">
          <Input
            id="access-new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
            aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </FormField>
      <FormField label="Yangi parolni tasdiqlang" htmlFor="access-confirm-password" required>
        <Input
          id="access-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </FormField>
      {error ? (
        <Alert title="Parolni tekshiring" tone="danger" className="sm:col-span-2">
          {error}
        </Alert>
      ) : null}
      {mutation.isError ? (
        <Alert title="Parol o‘zgartirilmadi" tone="danger" className="sm:col-span-2">
          {getApiErrorMessage(mutation.error)}
        </Alert>
      ) : null}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={mutation.isPending}>
          <KeyRound className="h-4 w-4" /> Parolni saqlash
        </Button>
      </div>
    </form>
  );
}

function RoleAccessForm({
  user,
  branches,
  onSaved,
}: {
  user: AuthenticatedUser;
  branches: Array<{ id: string; name: string }>;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState<AccessModel>(() => accessModelFor(user));
  const [branchId, setBranchId] = useState(
    () => user.roles.find((role) => role.role === 'cashier')?.branchId ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const requiresBranch = model === 'cashier' || model === 'finance_cashier';
  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateUserAccess(user.id, {
        roles:
          model === 'director'
            ? [{ role: 'director', branchId: null }]
            : model === 'finance_manager'
              ? [{ role: 'finance_manager', branchId: null }]
              : model === 'finance_cashier'
                ? [
                    { role: 'finance_manager', branchId: null },
                    { role: 'cashier', branchId },
                  ]
                : [{ role: 'cashier', branchId }],
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users }),
        queryClient.invalidateQueries({ queryKey: queryKeys.userDirectory }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      ]);
      onSaved();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (requiresBranch && !branchId) return setError('Kassir roli uchun filial scope majburiy.');
    setError(null);
    mutation.mutate();
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <FormField label="Access modeli" htmlFor="edit-user-access-model" required>
        <Select
          id="edit-user-access-model"
          value={model}
          onChange={(event) => setModel(event.target.value as AccessModel)}
        >
          <option value="cashier">Kassir</option>
          <option value="finance_manager">Moliya rahbari</option>
          <option value="finance_cashier">Moliya rahbari + kassir</option>
          <option value="director">Direktor</option>
        </Select>
      </FormField>
      {requiresBranch ? (
        <FormField label="Kassir write scope filiali" htmlFor="edit-user-access-branch" required>
          <Select
            id="edit-user-access-branch"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="">Tanlang</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
      {error ? (
        <Alert title="Accessni tekshiring" tone="danger" className="sm:col-span-2">
          {error}
        </Alert>
      ) : null}
      {mutation.isError ? (
        <Alert title="Access saqlanmadi" tone="danger" className="sm:col-span-2">
          {getApiErrorMessage(mutation.error)}
        </Alert>
      ) : null}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="secondary" loading={mutation.isPending}>
          <UserCog className="h-4 w-4" /> Accessni saqlash
        </Button>
      </div>
    </form>
  );
}
