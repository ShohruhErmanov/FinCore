import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePlus, Landmark, PencilLine, Power, Save } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import type {
  Branch,
  CategoryBaselineInput,
  ExpenseCategory,
  ExpenseType,
  MasterItem,
} from '@/shared/types/domain';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  CurrencyInput,
  LoadingState,
  MoneyText,
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
    description: 'Filial ro‘yxati. “Barchasi” — filtr, filial emas.',
  },
};

/**
 * The four reference lists the Excel "Sozlamalar" sheet keeps side by side.
 * They live on separate routes here, so a tab strip keeps them one section
 * rather than four unrelated pages.
 */
const SETTING_TABS: Array<{ kind: SettingKind; label: string; to: string }> = [
  { kind: 'categories', label: 'Xarajat kategoriyalari', to: routes.categories },
  { kind: 'departments', label: 'Bo‘limlar', to: routes.departments },
  { kind: 'payment-methods', label: 'To‘lov usullari', to: routes.paymentMethods },
  { kind: 'branches', label: 'Filiallar', to: routes.branches },
];

function SettingsTabs({ active }: { active: SettingKind }) {
  return (
    <nav aria-label="Sozlamalar bo‘limlari" className="mb-5 flex flex-wrap gap-1 border-b border-border">
      {SETTING_TABS.map((tab) => (
        <NavLink
          key={tab.kind}
          to={tab.to}
          aria-current={tab.kind === active ? 'page' : undefined}
          className={`-mb-px min-h-11 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab.kind === active
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

function useSettingData(kind: SettingKind) {
  return useQuery({
    queryKey: queryKeys.master(kind),
    queryFn: ({ signal }) =>
      kind === 'categories'
        ? referenceApi.categories(signal)
        : kind === 'departments'
          ? referenceApi.departments(signal)
          : kind === 'payment-methods'
            ? referenceApi.paymentMethods(signal)
            : adminApi.allBranches(signal),
    staleTime: 120_000,
  });
}

function SettingsPage({ kind }: { kind: SettingKind }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('master_data.manage');
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
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
            <Landmark className="h-4 w-4" />
            Faqat o‘qish
          </span>
        ),
    },
  ];
  const meta = config[kind];
  return (
    <>
      <SettingsTabs active={kind} />
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
        <Alert title="Yangi filial haqida" tone="info" className="mb-5">
          Yangi filial darhol o‘zingizga ochiladi — uni yaratganingizda u avtomatik ravishda
          sizning rol scope’ingizga qo‘shiladi. Boshqa xodimlar uchun uni “Foydalanuvchilar”
          bo‘limida alohida biriktirish kerak. “Barchasi” — filtr, filial emas.
        </Alert>
      ) : null}
      {creating ? (
        <CreateSettingPanel kind={kind} onClose={() => setCreating(false)} />
      ) : null}
      {kind === 'categories' && canManage ? <CategoryBaselineGrid /> : null}
      {/*
        Categories are shown by the baseline grid above, which already lists
        every category with its type — the status filter and the flat list would
        just repeat it, so that tab skips both.
      */}
      {kind === 'categories' ? null : (
        <>
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
            <ErrorState
              message={getApiErrorMessage(data.error)}
              onRetry={() => void data.refetch()}
            />
          ) : rows.length ? (
            <Card>
              <DataTable columns={columns} rows={rows} caption={meta.title} />
            </Card>
          ) : (
            <EmptyState description="Tanlangan holat bo‘yicha master-data topilmadi." />
          )}
        </>
      )}
    </>
  );
}


/**
 * The Excel «Sozlamalar» grid: every category with one editable amount per
 * branch, a computed row total, and the «Jami oylik reja (byudjet)» footer.
 *
 * This is the director’s baseline plan, not the monthly budget — reports keep
 * reading budget lines. Totals are recomputed as you type, the way the
 * spreadsheet behaves, and only edited cells are sent on save.
 */
function CategoryBaselineGrid() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const board = useQuery({
    queryKey: ['master', 'category-baselines'],
    queryFn: ({ signal }) => adminApi.categoryBaselines(signal),
  });

  const save = useMutation({
    mutationFn: (lines: CategoryBaselineInput[]) => adminApi.saveCategoryBaselines(lines),
    onSuccess: async () => {
      setDraft({});
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['master', 'category-baselines'] });
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const cellKey = (categoryId: string, branchId: string) => `${categoryId}:${branchId}`;
  const valueOf = (categoryId: string, branchId: string, stored: string) =>
    draft[cellKey(categoryId, branchId)] ?? stored;

  const totals = useMemo(() => {
    const byBranch: Record<string, bigint> = {};
    const byRow: Record<string, bigint> = {};
    let grand = 0n;
    for (const branch of board.data?.branches ?? []) byBranch[branch.branchId] = 0n;
    for (const row of board.data?.rows ?? []) {
      let rowTotal = 0n;
      for (const branch of board.data?.branches ?? []) {
        const raw =
          draft[cellKey(row.categoryId, branch.branchId)] ?? row.amounts[branch.branchId] ?? '0';
        const amount = /^\d+$/.test(raw) ? BigInt(raw) : 0n;
        rowTotal += amount;
        byBranch[branch.branchId] = (byBranch[branch.branchId] ?? 0n) + amount;
      }
      byRow[row.categoryId] = rowTotal;
      grand += rowTotal;
    }
    return { byBranch, byRow, grand };
  }, [board.data, draft]);

  if (board.isLoading) return <LoadingState label="Boshlang‘ich reja yuklanmoqda…" />;
  if (board.isError)
    return (
      <ErrorState message={getApiErrorMessage(board.error)} onRetry={() => void board.refetch()} />
    );
  if (!board.data) return null;

  const { branches, rows } = board.data;
  const dirty = Object.keys(draft).length > 0;

  const submit = () => {
    const lines: CategoryBaselineInput[] = [];
    for (const [key, raw] of Object.entries(draft)) {
      if (!/^\d+$/.test(raw))
        return setError('Summalar manfiy bo\u2018lmagan butun so\u2018mda bo\u2018lsin.');
      const [categoryId, branchId] = key.split(':');
      lines.push({ categoryId: categoryId!, branchId: branchId!, amountUzs: raw });
    }
    setError(null);
    save.mutate(lines);
  };

  return (
    <Card
      title="Boshlang‘ich oylik reja"
      description="Har kategoriya uchun filial bo‘yicha summa. Jami ustuni va pastdagi yakuniy qator avtomatik hisoblanadi."
      className="mb-5"
      actions={
        <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
          <Save className="h-4 w-4" /> Saqlash
        </Button>
      }
    >
      {error ? (
        <Alert title="Saqlanmadi" tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {save.isSuccess && !dirty ? (
        <Alert title="Saqlandi" tone="success" className="mb-4">
          Boshlang‘ich reja yangilandi.
        </Alert>
      ) : null}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Boshlang‘ich oylik reja</caption>
          <thead>
            <tr className="border-b border-border bg-slate-50">
              <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Kategoriya
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Turi
              </th>
              {branches.map((branch) => (
                <th
                  key={branch.branchId}
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Boshlang‘ich {branch.name}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                Boshlang‘ich jami
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.categoryId} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-ink">{row.name}</span>
                  {row.isActive ? null : (
                    <span className="ml-2 text-xs text-muted">nofaol</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {row.expenseType === 'fixed' ? 'Doimiy' : 'O\u2018zgaruvchan'}
                </td>
                {branches.map((branch) => (
                  <td key={branch.branchId} className="px-4 py-2.5 text-right">
                    <CurrencyInput
                      aria-label={`${row.name} — ${branch.name}`}
                      className="w-40 text-right"
                      value={valueOf(row.categoryId, branch.branchId, row.amounts[branch.branchId] ?? '0')}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [cellKey(row.categoryId, branch.branchId)]: event.target.value.replace(/\D/g, ''),
                        }))
                      }
                    />
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-semibold text-ink">
                  <MoneyText value={(totals.byRow[row.categoryId] ?? 0n).toString()} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-slate-50">
              <th scope="row" colSpan={2} className="px-4 py-3 text-left font-semibold text-ink">
                Jami oylik reja (byudjet):
              </th>
              {branches.map((branch) => (
                <td key={branch.branchId} className="px-4 py-3 text-right font-semibold text-ink">
                  <MoneyText value={(totals.byBranch[branch.branchId] ?? 0n).toString()} />
                </td>
              ))}
              <td className="px-4 py-3 text-right text-base font-bold text-ink">
                <MoneyText value={totals.grand.toString()} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
function CreateSettingPanel({
  kind,
  onClose,
}: {
  kind: SettingKind;
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
        // Creating a branch also widens the creator’s own scope on the server,
        // so the cached session and the scoped branch list behind the top bar
        // are both stale the moment this returns.
        ...(kind === 'branches'
          ? [
              queryClient.invalidateQueries({ queryKey: queryKeys.branches }),
              queryClient.invalidateQueries({ queryKey: queryKeys.me }),
            ]
          : []),
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

function SettingActions({ kind, row }: { kind: SettingKind; row: SettingRow }) {
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
