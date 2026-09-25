import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePlus, Eye, EyeOff, KeyRound, Trash2, UserCog } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime } from '@/shared/lib/format';
import type {
  AccountingPeriod,
  AuthenticatedUser,
  InvestorCapitalPaymentMethodCode,
  MasterItem,
  RoleCode,
  UserStatus,
} from '@/shared/types/domain';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  CurrencyInput,
  DataTable,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  Select,
  useToast,
  type Column,
} from '@/shared/ui';

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
      key: 'salary',
      header: 'Fix oylik',
      className: 'text-right',
      cell: (row) => <SalaryCell user={row} />,
    },
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
      cell: (row) => (
        <div className="flex min-w-52 items-center justify-end gap-2">
          {canDeactivateUsers && currentUser?.id !== row.id ? <UserStatusAction user={row} /> : null}
          {canDeleteUsers && currentUser?.id !== row.id ? <DeleteUserAction user={row} /> : null}
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
        <EditUserAccessPanel
          key={editingAccess.id}
          user={editingAccess}
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

type AccessModel = 'cashier' | 'finance_manager' | 'finance_cashier' | 'director';

function accessModelFor(user: AuthenticatedUser): AccessModel {
  if (user.roles.some((role) => role.role === 'director')) return 'director';
  const finance = user.roles.some((role) => role.role === 'finance_manager');
  const cashier = user.roles.some((role) => role.role === 'cashier');
  return finance && cashier ? 'finance_cashier' : finance ? 'finance_manager' : 'cashier';
}

function EditUserAccessPanel({
  user,
  branches,
  onClose,
}: {
  user: AuthenticatedUser;
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
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
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (requiresBranch && !branchId) return setError('Kassir roli uchun filial scope majburiy.');
    setError(null);
    mutation.mutate();
  };
  return (
    <Card
      title={`${user.fullName}: rol va filial access`}
      description="Read scope va write scope serverda rol birikmalaridan qayta hosil qilinadi."
      className="mb-5"
    >
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
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
          <Alert title="Accessni tekshiring" tone="danger" className="md:col-span-2">
            {error}
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert title="Access saqlanmadi" tone="danger" className="md:col-span-2">
            {getApiErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            <KeyRound className="h-4 w-4" /> Accessni saqlash
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CreateUserPanel({
  branches,
  periods,
  paymentMethods,
  canCreateInvestor,
  onClose,
}: {
  branches: Array<{ id: string; name: string }>;
  periods: AccountingPeriod[];
  paymentMethods: MasterItem[];
  canCreateInvestor: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<RoleCode>('cashier');
  const [alsoCashier, setAlsoCashier] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Ulush, kapital va keyingi payout — uchta mustaqil moliyaviy tushuncha.
  const [ownershipPercent, setOwnershipPercent] = useState('');
  const [capitalAmountUzs, setCapitalAmountUzs] = useState('');
  const [startPeriodId, setStartPeriodId] = useState('');
  const [capitalPaymentMethodCode, setCapitalPaymentMethodCode] =
    useState<InvestorCapitalPaymentMethodCode | ''>('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      adminApi.createUser({
        fullName: fullName.trim(),
        phone: phone.trim(),
        role,
        branchId: role === 'cashier' || role === 'investor' ? branchId || null : null,
        cashierBranchId: role === 'finance_manager' && alsoCashier ? branchId : null,
        password,
        confirmPassword,
        ...(role === 'investor'
          ? {
              ownershipPercent: Number(ownershipPercent),
              capitalAmountUzs: capitalAmountUzs.replace(/\D/g, ''),
              startPeriodId,
              capitalPaymentMethodCode: capitalPaymentMethodCode as InvestorCapitalPaymentMethodCode,
            }
          : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users }),
        queryClient.invalidateQueries({ queryKey: queryKeys.userDirectory }),
      ]);
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (fullName.trim().length < 3) return setError('F.I.Sh. ni kiriting.');
    if (!/^\+998\d{9}$/.test(phone.replace(/\s/g, '')))
      return setError('Telefon +998XXXXXXXXX formatida bo‘lsin.');
    if ((role === 'cashier' || (role === 'finance_manager' && alsoCashier)) && !branchId)
      return setError('Kassir roli uchun filial scope majburiy.');
    if (role === 'investor') {
      const percent = Number(ownershipPercent);
      if (!ownershipPercent.trim() || !Number.isFinite(percent) || percent < 0 || percent > 100)
        return setError('Ulush 0 va 100 foiz orasida bo‘lishi kerak.');
      const capitalDigits = capitalAmountUzs.replace(/\D/g, '');
      if (!capitalDigits || BigInt(capitalDigits) <= 0n)
        return setError('Mablag‘ 0 dan katta bo‘lishi kerak.');
      if (!startPeriodId) return setError('Qo‘shilish oyini tanlang.');
      if (!capitalPaymentMethodCode) return setError('To‘lov shaklini tanlang.');
    }
    if (password.length < 12) return setError('Parol kamida 12 belgidan iborat bo‘lsin.');
    if (password !== confirmPassword) return setError('Parol va tasdiqlash mos emas.');
    setError(null);
    mutation.mutate();
  };
  return (
    <Card title="Yangi foydalanuvchi" className="mb-5">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <FormField label="F.I.Sh." htmlFor="user-full-name" required>
          <Input
            id="user-full-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </FormField>
        <FormField label="Telefon" htmlFor="user-phone" required hint="+998XXXXXXXXX">
          <Input
            id="user-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </FormField>
        <FormField
          label="Parol"
          htmlFor="user-password"
          required
          hint="Kamida 12 belgi‑ xodimga alohida yetkazing"
        >
          <div className="relative">
            <Input
              id="user-password"
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
        <FormField label="Parolni tasdiqlang" htmlFor="user-password-confirm" required>
          <Input
            id="user-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </FormField>
        <FormField label="Rol" htmlFor="user-role" required>
          <Select
            id="user-role"
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as RoleCode;
              setRole(nextRole);
              if (nextRole !== 'investor') {
                setOwnershipPercent('');
                setCapitalAmountUzs('');
                setStartPeriodId('');
                setCapitalPaymentMethodCode('');
              }
            }}
          >
            <option value="cashier">Kassir</option>
            <option value="finance_manager">Moliya rahbari</option>
            <option value="director">Direktor</option>
            {canCreateInvestor ? <option value="investor">Investor</option> : null}
          </Select>
        </FormField>
        {role === 'investor' ? (
          <section className="grid gap-4 rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/80 to-white p-4 shadow-sm md:col-span-2 md:grid-cols-2 md:p-5">
            <div className="md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                Investor moliyaviy ma’lumotlari
              </p>
              <p className="mt-1 text-sm text-muted">
                Kapital payout emas. Qo‘shilish oyi foyda ulushi hisoblanadigan birinchi davrni belgilaydi.
              </p>
            </div>
            <FormField
              label="Kompaniyadagi ulush, %"
              htmlFor="user-ownership"
              required
              hint="Masalan 2. Bu olingan summa foizi emas."
            >
              <Input
                id="user-ownership"
                inputMode="decimal"
                value={ownershipPercent}
                onChange={(event) => setOwnershipPercent(event.target.value)}
              />
            </FormField>
            <FormField
              label="Investor kiritgan mablag‘"
              htmlFor="user-capital"
              required
              hint="Kompaniyaga amalda kiritilgan boshlang‘ich kapital."
            >
              <CurrencyInput
                id="user-capital"
                pattern="[0-9 ]*"
                value={capitalAmountUzs}
                onChange={(event) => setCapitalAmountUzs(formatCapitalInput(event.target.value))}
              />
            </FormField>
            <FormField label="Qo‘shilish oyi" htmlFor="user-investor-start" required>
              <Select
                id="user-investor-start"
                value={startPeriodId}
                onChange={(event) => setStartPeriodId(event.target.value)}
              >
                <option value="">Yil va oyni tanlang</option>
                {[...periods]
                  .sort((a, b) => b.year - a.year || b.month - a.month)
                  .map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.label}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField label="Filial (ixtiyoriy)" htmlFor="user-investor-branch">
              <Select
                id="user-investor-branch"
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Butun kompaniya</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-sm font-semibold text-slate-700">Pul shakli *</legend>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Pul shakli">
                {(
                  [
                    ['CASH', 'Naqd pul'],
                    ['CARD', 'Plastik / Karta'],
                    ['BANK_TRANSFER', 'Bank o‘tkazmasi'],
                  ] as const
                ).map(([code, label]) => {
                  const available = paymentMethods.some(
                    (method) => method.code === code && method.isActive,
                  );
                  const selected = capitalPaymentMethodCode === code;
                  return (
                    <label
                      key={code}
                      className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold transition ${
                        selected
                          ? 'border-blue-500 bg-blue-600 text-white shadow-md shadow-blue-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
                      } ${available ? '' : 'cursor-not-allowed opacity-45'}`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="capital-payment-method"
                        value={code}
                        checked={selected}
                        disabled={!available}
                        onChange={() => setCapitalPaymentMethodCode(code)}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>
        ) : null}
        {role === 'finance_manager' ? (
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2">
            <input
              type="checkbox"
              checked={alsoCashier}
              onChange={(event) => setAlsoCashier(event.target.checked)}
            />
            <span className="text-sm font-medium text-ink">
              Filial kassiri rolini ham biriktirish
            </span>
          </label>
        ) : null}
        {role === 'cashier' || (role === 'finance_manager' && alsoCashier) ? (
          <FormField label="Filial scope" htmlFor="user-branch" required>
            <Select
              id="user-branch"
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
          <Alert title="Formani tekshiring" tone="danger" className="md:col-span-2">
            {error}
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert title="User yaratilmadi" tone="danger" className="md:col-span-2">
            {getApiErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            <UserCog className="h-4 w-4" />
            User yaratish
          </Button>
        </div>
      </form>
    </Card>
  );
}

function formatCapitalInput(value: string): string {
  return value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function SalaryCell({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(user.fixedSalaryUzs);
  const mutation = useMutation({
    mutationFn: () => adminApi.updateUserSalary(user.id, value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.users });
      await queryClient.invalidateQueries({ queryKey: ['report'] });
    },
  });
  return (
    <div className="flex min-w-44 items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      <CurrencyInput
        aria-label={`${user.fullName} fix oyligi`}
        className="text-right"
        value={value}
        onChange={(event) => {
          if (/^\d*$/.test(event.target.value)) setValue(event.target.value || '0');
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={value === user.fixedSalaryUzs}
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Saqlash
      </Button>
    </div>
  );
}

function UserStatusAction({ user }: { user: AuthenticatedUser }) {
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

function DeleteUserAction({ user }: { user: AuthenticatedUser }) {
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

function UserStatusBadge({ value }: { value: UserStatus }) {
  const label = value === 'active' ? 'Faol' : value === 'inactive' ? 'Nofaol' : 'Bloklangan';
  const style =
    value === 'active'
      ? 'bg-green-50 text-green-800'
      : value === 'inactive'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-red-50 text-red-800';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}
