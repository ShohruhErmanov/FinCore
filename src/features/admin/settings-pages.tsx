import { CirclePlus, Landmark } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  type Column,
} from '@/shared/ui';
import { SETTING_META, type SettingKind, type SettingRow, useSettingData } from './settings-config';
import { CreateSettingPanel, SettingActions } from './setting-actions';
import { SettingsTabs } from './settings-tabs';
import { CategoryBaselineGrid } from './category-baseline-grid';

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
        <code className="neu-inset rounded px-2 py-1 text-xs text-slate-700">{row.code}</code>
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
  const meta = SETTING_META[kind];
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
          Yangi filial darhol o‘zingizga ochiladi — uni yaratganingizda u avtomatik ravishda sizning
          rol scope’ingizga qo‘shiladi. Boshqa xodimlar uchun uni “Foydalanuvchilar” bo‘limida
          alohida biriktirish kerak. “Barchasi” — filtr, filial emas.
        </Alert>
      ) : null}
      {creating ? <CreateSettingPanel kind={kind} onClose={() => setCreating(false)} /> : null}
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
                  setSearchParams(
                    event.target.value === 'all' ? {} : { status: event.target.value },
                  )
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
