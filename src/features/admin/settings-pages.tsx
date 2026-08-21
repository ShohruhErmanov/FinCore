import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePlus, Landmark, PencilLine, Power } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import type { Branch, ExpenseCategory, ExpenseType, MasterItem } from '@/shared/types/domain';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  Select,
  type Column,
} from '@/shared/ui';

type SettingKind = 'categories' | 'departments' | 'payment-methods' | 'branches';
type SettingRow = (ExpenseCategory | MasterItem | Branch) & { id: string };

const config: Record<SettingKind, { title: string; singular: string; description: string }> = {
  categories: {
    title: 'Xarajat kategoriyalari',
    singular: 'kategoriya',
    description: 'Kategoriya turi server-derived snapshot sifatida moliyaviy yozuvlarda saqlanadi.',
  },
  departments: {
    title: 'Bo‘limlar',
    singular: 'bo‘lim',
    description: 'Xarajatning tashkiliy kesimi uchun canonical master-data.',
  },
  'payment-methods': {
    title: 'To‘lov usullari',
    singular: 'to‘lov usuli',
    description: 'Xarajat va tushum kanallari uchun immutable ID’li lug‘at.',
  },
  branches: {
    title: 'Filiallar',
    singular: 'filial',
    description: 'V1 doirasida faqat Sayxun va Xalqlar do‘stligi; “Barchasi” filial emas.',
  },
};

function useSettingData(kind: SettingKind) {
  return useQuery({
    queryKey: kind === 'branches' ? queryKeys.branches : queryKeys.master(kind),
    queryFn: ({ signal }) =>
      kind === 'categories'
        ? referenceApi.categories(signal)
        : kind === 'departments'
          ? referenceApi.departments(signal)
          : kind === 'payment-methods'
            ? referenceApi.paymentMethods(signal)
            : referenceApi.branches(signal),
    staleTime: 120_000,
  });
}

function SettingsPage({ kind }: { kind: SettingKind }) {
  const { hasPermission } = useAuth();
  const canManage = kind !== 'branches' && hasPermission('master_data.manage');
  const data = useSettingData(kind);
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const status = searchParams.get('status') || 'all';
  const rows = useMemo<SettingRow[]>(
    () =>
      ((data.data ?? []) as SettingRow[]).filter(
        (item) => status === 'all' || (status === 'active' ? item.isActive : !item.isActive),
      ),
    [data.data, status],
  );
  const columns: Column<SettingRow>[] = [
    {
      key: 'code',
      header: 'Kod',
      cell: (row) => (
        <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{row.code}</code>
      ),
    },
    {
      key: 'name',
      header: 'Nomi',
      cell: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.name}</p>
          {'aliases' in row && row.aliases.length ? (
            <p className="mt-1 text-xs text-muted">Alias: {row.aliases.join(', ')}</p>
          ) : null}
        </div>
      ),
    },
    ...(kind === 'categories'
      ? [
          {
            key: 'type',
            header: 'Xarajat turi',
            cell: (row: SettingRow) => (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {'expenseType' in row
                  ? row.expenseType === 'fixed'
                    ? 'Doimiy'
                    : 'O‘zgaruvchan'
                  : '—'}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'status',
      header: 'Holat',
      cell: (row) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.isActive ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-700'}`}
        >
          {row.isActive ? 'Faol' : 'Nofaol · tarixiy'}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      cell: (row) =>
        canManage ? (
          <SettingActions kind={kind} row={row} />
        ) : kind === 'branches' ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
            <Landmark className="h-4 w-4" />
            V1 read-only
          </span>
        ) : null,
    },
  ];
  const meta = config[kind];
  return (
    <>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          canManage ? (
            <Button onClick={() => setCreating((value) => !value)}>
              <CirclePlus className="h-4 w-4" />
              Yangi {meta.singular}
            </Button>
          ) : undefined
        }
      />
      {kind === 'branches' ? (
        <Alert title="V1 filial cheklovi" tone="info" className="mb-5">
          Yangi filial yaratish va “Barchasi”ni master-row sifatida qo‘shish scope’dan tashqarida.
        </Alert>
      ) : null}
      {creating && kind !== 'branches' ? (
        <CreateSettingPanel kind={kind} onClose={() => setCreating(false)} />
      ) : null}
      <Card className="mb-5">
        <label htmlFor={`${kind}-status`} className="block max-w-xs space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Holat
          </span>
          <Select
            id={`${kind}-status`}
            value={status}
            onChange={(event) =>
              setSearchParams(event.target.value === 'all' ? {} : { status: event.target.value })
            }
          >
            <option value="all">Barchasi</option>
            <option value="active">Faol</option>
            <option value="inactive">Nofaol (tarixiy)</option>
          </Select>
        </label>
      </Card>
      {data.isLoading ? (
        <LoadingState label={`${meta.title} yuklanmoqda…`} />
      ) : data.isError ? (
        <ErrorState message={getApiErrorMessage(data.error)} onRetry={() => void data.refetch()} />
      ) : rows.length ? (
        <Card>
          <DataTable columns={columns} rows={rows} caption={meta.title} />
        </Card>
      ) : (
        <EmptyState description="Tanlangan holat bo‘yicha master-data topilmadi." />
      )}
    </>
  );
}

function CreateSettingPanel({
  kind,
  onClose,
}: {
  kind: Exclude<SettingKind, 'branches'>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>('variable');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      adminApi.createMaster<SettingRow>(kind, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        ...(kind === 'categories' ? { expenseType } : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.master(kind) }),
        queryClient.invalidateQueries({ queryKey: ['report'] }),
      ]);
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code.trim().toUpperCase()))
      return setError('Kod A–Z bilan boshlanib, faqat A–Z, raqam va _ dan iborat bo‘lsin.');
    if (name.trim().length < 2) return setError('Nomni kiriting.');
    setError(null);
    mutation.mutate();
  };
  return (
    <Card title={`Yangi ${config[kind].singular}`} className="mb-5">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <FormField label="Kod" htmlFor={`${kind}-code`} required>
          <Input
            id={`${kind}-code`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="MASALAN_CODE"
          />
        </FormField>
        <FormField label="Nomi" htmlFor={`${kind}-name`} required>
          <Input
            id={`${kind}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        {kind === 'categories' ? (
          <FormField label="Xarajat turi" htmlFor="category-expense-type" required>
            <Select
              id="category-expense-type"
              value={expenseType}
              onChange={(event) => setExpenseType(event.target.value as ExpenseType)}
            >
              <option value="fixed">Doimiy</option>
              <option value="variable">O‘zgaruvchan</option>
            </Select>
          </FormField>
        ) : null}
        {error ? (
          <Alert title="Formani tekshiring" tone="danger" className="md:col-span-2">
            {error}
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert title="Saqlab bo‘lmadi" tone="danger" className="md:col-span-2">
            {getApiErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Saqlash
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SettingActions({
  kind,
  row,
}: {
  kind: Exclude<SettingKind, 'branches'>;
  row: SettingRow;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [expenseType, setExpenseType] = useState<ExpenseType>(
    'expenseType' in row ? row.expenseType : 'variable',
  );
  const mutation = useMutation({
    mutationFn: (body: { isActive?: boolean; name?: string; expenseType?: ExpenseType }) =>
      adminApi.updateMaster<SettingRow>(kind, row.id, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.master(kind) }),
        queryClient.invalidateQueries({ queryKey: ['report'] }),
      ]);
      setEditing(false);
    },
  });
  if (editing) {
    return (
      <div className="flex min-w-72 flex-wrap items-center justify-end gap-2">
        <label className="sr-only" htmlFor={`edit-${row.id}-name`}>
          Yangi nom
        </label>
        <Input
          id={`edit-${row.id}-name`}
          className="max-w-48"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {kind === 'categories' ? (
          <Select
            aria-label="Yangi xarajat turi"
            className="max-w-40"
            value={expenseType}
            onChange={(event) => setExpenseType(event.target.value as ExpenseType)}
          >
            <option value="fixed">Doimiy</option>
            <option value="variable">O‘zgaruvchan</option>
          </Select>
        ) : null}
        <Button
          size="sm"
          loading={mutation.isPending}
          disabled={name.trim().length < 2}
          onClick={() =>
            mutation.mutate({
              name: name.trim(),
              ...(kind === 'categories' ? { expenseType } : {}),
            })
          }
        >
          Saqlash
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Bekor
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(true)}
        title="Nom yoki turni tahrirlash"
      >
        <PencilLine className="h-4 w-4" />
        <span className="sr-only">Tahrirlash</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={mutation.isPending}
        onClick={() => {
          if (
            !row.isActive ||
            window.confirm(
              'Nofaol qilish yangi tanlovlardan yashiradi, lekin tarixiy hisobotlarni o‘zgartirmaydi. Davom etilsinmi?',
            )
          )
            mutation.mutate({ isActive: !row.isActive });
        }}
        title={row.isActive ? 'Nofaol qilish' : 'Faollashtirish'}
      >
        <Power className="h-4 w-4" />
        <span className="sr-only">{row.isActive ? 'Nofaol qilish' : 'Faollashtirish'}</span>
      </Button>
    </div>
  );
}

export function CategoriesPage() {
  return <SettingsPage kind="categories" />;
}
export function DepartmentsPage() {
  return <SettingsPage kind="departments" />;
}
export function PaymentMethodsPage() {
  return <SettingsPage kind="payment-methods" />;
}
export function BranchesPage() {
  return <SettingsPage kind="branches" />;
}
