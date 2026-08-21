import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '@/shared/api/client';
import { referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDateTime } from '@/shared/lib/format';
import type { AccountingPeriod } from '@/shared/types/domain';
import {
  Alert,
  Card,
  DataTable,
  ErrorState,
  KpiCard,
  LoadingState,
  PageHeader,
  StatusBadge,
  type Column,
} from '@/shared/ui';

export function PeriodsPage() {
  const periods = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
  });
  const rows = periods.data ?? [];
  const columns: Column<AccountingPeriod>[] = [
    {
      key: 'period',
      header: 'Hisob davri',
      cell: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.label}</p>
          <p className="text-xs text-muted">
            {row.year}-{String(row.month).padStart(2, '0')}
          </p>
        </div>
      ),
    },
    { key: 'status', header: 'Holat', cell: (row) => <StatusBadge status={row.status} /> },
    { key: 'closedBy', header: 'Yopgan user', cell: (row) => row.closedByName ?? '—' },
    {
      key: 'closedAt',
      header: 'Yopilgan vaqt',
      cell: (row) => (row.closedAt ? formatDateTime(row.closedAt) : '—'),
    },
    {
      key: 'action',
      header: '',
      cell: (row) => (
        <Link
          to={routes.periodDetail(row.id)}
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          Readiness va tarix
          <ArrowRight className="h-4 w-4" />
        </Link>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Hisob davrlari va arxiv"
        description="Close-readiness, yopish, majburiy sabab bilan reopen va tarixiy snapshot nazorati."
      />
      <Alert title="Yopish eslatmasi" tone="info" className="mb-5">
        <CalendarClock className="mr-1 inline h-4 w-4" />
        Keyingi oyning 1–5 kunlari oldingi oy tafovutlari ko‘rib chiqilib, direktor tomonidan
        yopiladi.
      </Alert>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Ochiq davr"
          value={rows.filter((item) => item.status === 'open').length}
          helper="Mutationlar faqat ochiq davrda."
          tone="success"
        />
        <KpiCard
          label="Yopiq davr"
          value={rows.filter((item) => item.status === 'closed').length}
          helper="Expense, budget va revenue faktlari immutable."
        />
        <KpiCard
          label="Snapshot arxivi"
          value={rows.filter((item) => item.closedAt).length}
          helper="Yopishdagi report/export rekordi."
          tone="info"
        />
      </div>
      {periods.isLoading ? (
        <LoadingState label="Hisob davrlari yuklanmoqda…" />
      ) : periods.isError ? (
        <ErrorState
          message={getApiErrorMessage(periods.error)}
          onRetry={() => void periods.refetch()}
        />
      ) : (
        <Card title="Davrlar">
          <DataTable columns={columns} rows={rows} caption="Hisob davrlari va yopilish holati" />
        </Card>
      )}
    </>
  );
}
