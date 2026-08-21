import { useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/shared/api/client';
import { operationsApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime } from '@/shared/lib/format';
import type { AuditEvent } from '@/shared/types/domain';
import {
  Button,
  Card,
  DataTable,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  type Column,
} from '@/shared/ui';
import {
  FilterCard,
  NativeFilter,
  numericPage,
  querySignature,
  useRevenueReferences,
} from '@/features/revenue/revenue-shared';

export function AuditPage() {
  const references = useRevenueReferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);
  const page = numericPage(searchParams.get('page'));
  const pageSize = 25;
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    next.delete('page');
    setSearchParams(next);
  };
  const filters = {
    actor: searchParams.get('actor') ?? undefined,
    action: searchParams.get('action') ?? undefined,
    entityType: searchParams.get('entityType') ?? undefined,
    branch: searchParams.get('branch') ?? undefined,
    result: searchParams.get('result') ?? undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    page,
    pageSize,
  };
  const audit = useQuery({
    queryKey: queryKeys.audit(querySignature(searchParams)),
    queryFn: ({ signal }) => operationsApi.audit(filters, signal),
  });
  const columns: Column<AuditEvent>[] = [
    {
      key: 'time',
      header: 'Vaqt',
      cell: (row) => (
        <time className="whitespace-nowrap text-xs tabular-nums">
          {formatDateTime(row.occurredAt)}
        </time>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      cell: (row) => <span className="font-semibold text-ink">{row.actorName}</span>,
    },
    {
      key: 'action',
      header: 'Amal',
      cell: (row) => (
        <button
          type="button"
          className="text-left font-mono text-xs font-semibold text-primary hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(expanded === row.id ? null : row.id);
          }}
        >
          {row.action}
        </button>
      ),
    },
    {
      key: 'entity',
      header: 'Obyekt',
      cell: (row) => (
        <div>
          <p>{row.entityType}</p>
          <p
            className="max-w-48 truncate font-mono text-[11px] text-muted"
            title={String(row.entityId)}
          >
            {row.entityId}
          </p>
          {expanded === row.id && row.changes?.length ? (
            <dl className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
              {row.changes.map((change) => (
                <div key={change.field}>
                  <dt className="font-semibold">{change.field}</dt>
                  <dd className="text-muted">
                    {change.before ?? '—'} → {change.after ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ),
    },
    { key: 'branch', header: 'Filial', cell: (row) => row.branchName ?? 'Global' },
    { key: 'result', header: 'Natija', cell: (row) => <AuditResult value={row.result} /> },
    {
      key: 'reason',
      header: 'Sabab',
      cell: (row) => <span className="max-w-xs text-sm text-muted">{row.reason ?? '—'}</span>,
    },
  ];
  const exportCsv = () => {
    const rows = audit.data?.items ?? [];
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = [
      'Vaqt,Actor,Amal,Obyekt,Filial,Natija,Sabab',
      ...rows.map((item) =>
        [
          formatDateTime(item.occurredAt),
          item.actorName,
          item.action,
          `${item.entityType}:${item.entityId}`,
          item.branchName ?? 'Global',
          item.result,
          item.reason ?? '',
        ]
          .map(quote)
          .join(','),
      ),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fincore-audit-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Moliyaviy va boshqaruv harakatlarining kim/qachon/nima/sabab yozuvlari. Parol, cookie va tokenlar loglanmaydi."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!audit.data?.items.length}>
            <Download className="h-4 w-4" />
            Joriy sahifa CSV
          </Button>
        }
      />
      <FilterCard>
        <NativeFilter
          label="Actor"
          value={searchParams.get('actor') || 'all'}
          allLabel="Barcha userlar"
          onChange={(value) => setFilter('actor', value)}
        >
          {references.users.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.fullName}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label="Filial"
          value={searchParams.get('branch') || 'all'}
          allLabel="Barcha / Global"
          onChange={(value) => setFilter('branch', value)}
        >
          {references.branches.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label="Natija"
          value={searchParams.get('result') || 'all'}
          allLabel="Barcha natijalar"
          onChange={(value) => setFilter('result', value)}
        >
          <option value="success">Muvaffaqiyatli</option>
          <option value="denied">Rad etilgan</option>
          <option value="failed">Xato</option>
        </NativeFilter>
        <NativeFilter
          label="Obyekt"
          value={searchParams.get('entityType') || 'all'}
          allLabel="Barcha obyektlar"
          onChange={(value) => setFilter('entityType', value)}
        >
          <option value="expense">Xarajat</option>
          <option value="revenue_transaction">Tushum</option>
          <option value="accounting_period">Hisob davri</option>
          <option value="user">User</option>
        </NativeFilter>
        <FormField label="Boshlanish sanasi" htmlFor="audit-date-from">
          <Input
            id="audit-date-from"
            type="date"
            value={searchParams.get('dateFrom') || ''}
            onChange={(event) => setFilter('dateFrom', event.target.value)}
          />
        </FormField>
        <FormField label="Tugash sanasi" htmlFor="audit-date-to">
          <Input
            id="audit-date-to"
            type="date"
            value={searchParams.get('dateTo') || ''}
            onChange={(event) => setFilter('dateTo', event.target.value)}
          />
        </FormField>
        <FormField label="Qidiruv" htmlFor="audit-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
            <Input
              id="audit-search"
              className="pl-9"
              value={searchParams.get('search') || ''}
              onChange={(event) => setFilter('search', event.target.value)}
              placeholder="Amal, obyekt, sabab"
            />
          </div>
        </FormField>
      </FilterCard>
      {audit.isLoading ? (
        <LoadingState label="Audit log yuklanmoqda…" />
      ) : audit.isError ? (
        <ErrorState
          message={getApiErrorMessage(audit.error)}
          onRetry={() => void audit.refetch()}
        />
      ) : (
        <Card>
          <DataTable columns={columns} rows={audit.data?.items ?? []} caption="Tizim audit logi" />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={audit.data?.total ?? 0}
            onPageChange={(nextPage) => {
              const next = new URLSearchParams(searchParams);
              next.set('page', String(nextPage));
              setSearchParams(next);
            }}
          />
        </Card>
      )}
    </>
  );
}

function AuditResult({ value }: { value: AuditEvent['result'] }) {
  const label =
    value === 'success' ? 'Muvaffaqiyatli' : value === 'denied' ? 'Rad etilgan' : 'Xato';
  const style =
    value === 'success'
      ? 'bg-green-50 text-green-800'
      : value === 'denied'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-red-50 text-red-800';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}
