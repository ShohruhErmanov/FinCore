import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { auditApi } from '@/shared/api/contracts';
import { formatDateTime } from '@/shared/lib/format';
import type { AuditLogRow } from '@/shared/types/domain';
import { describeAuditAction, type AuditActionKind } from './audit-actions';
import {
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  StatusBadge,
  type Column,
} from '@/shared/ui';

const columns: Column<AuditLogRow>[] = [
  { key: 'time', header: 'Vaqt', cell: (row) => formatDateTime(row.occurredAt) },
  { key: 'actor', header: 'Bajargan', cell: (row) => row.actorName },
  { key: 'action', header: 'Amal', cell: (row) => <AuditAction code={row.action} /> },
  {
    key: 'entity',
    header: 'Obyekt',
    cell: (row) => (
      <span className="block max-w-72 truncate" title={`${row.entityType}: ${row.entityId}`}>
        {row.entityType} · {row.entityId}
      </span>
    ),
  },
  { key: 'branch', header: 'Filial', cell: (row) => row.branchName ?? 'Umumiy' },
  {
    key: 'result',
    header: 'Natija',
    cell: (row) => <StatusBadge status={row.result === 'success' ? 'active' : 'blocked'} />,
  },
];

const KIND_STYLE: Record<AuditActionKind, string> = {
  create: 'bg-emerald-500',
  update: 'bg-blue-500',
  delete: 'bg-rose-500',
  security: 'bg-amber-500',
  other: 'bg-slate-400',
};

/**
 * The sentence first, the code under it: the code is what the search box
 * matches, so it stays visible rather than being translated away.
 */
function AuditAction({ code }: { code: string }) {
  const { label, kind } = describeAuditAction(code);
  return (
    <div className="flex min-w-56 items-start gap-2">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_STYLE[kind]}`}
      />
      <div className="min-w-0">
        <p className="font-medium text-ink">{label}</p>
        {label === code ? null : <p className="font-mono text-[11px] text-muted">{code}</p>}
      </div>
    </div>
  );
}

export function AuditLogsPage() {
  const [action, setAction] = useState('');
  const query = useQuery({
    queryKey: ['audit-logs', action],
    queryFn: ({ signal }) => auditApi.list({ page: 1, pageSize: 100, action }, signal),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit jurnali"
        description="Tizimdagi muhim amallar. Parol, token va boshqa maxfiy payloadlar ko‘rsatilmaydi."
      />
      <Card>
        <div className="mb-5 max-w-md">
          <FormField
            label="Amal kodi bo‘yicha qidirish"
            htmlFor="audit-action"
            hint="Har bir amal tagidagi kulrang kod bo‘yicha"
          >
            <Input
              id="audit-action"
              value={action}
              placeholder="Masalan: expenses yoki users.create"
              onChange={(event) => setAction(event.target.value)}
            />
          </FormField>
        </div>
        {query.isLoading ? <LoadingState label="Audit jurnali yuklanmoqda…" /> : null}
        {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
        {query.data && query.data.data.length === 0 ? (
          <EmptyState description="Tanlangan filtr bo‘yicha audit yozuvi topilmadi." />
        ) : null}
        {query.data && query.data.data.length > 0 ? (
          <DataTable caption="Audit jurnali" rows={query.data.data} columns={columns} />
        ) : null}
      </Card>
    </div>
  );
}
