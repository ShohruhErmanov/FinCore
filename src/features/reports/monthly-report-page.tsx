import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { downloadCsv } from '@/shared/lib/csv';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { MONTH_NAMES_UZ, formatPercent } from '@/shared/lib/format';
import type { ExpenseType, MonthlyReport } from '@/shared/types/domain';
import { Breadcrumbs, Button, EmptyState, ErrorState, PageHeader } from '@/shared/ui';
import {
  averageMonthlyPlan,
  buildMonthlyReportMatrix,
  type MonthlyReportSectionSummary,
} from './monthly-report';
import { MonthlyReportDashboard, MonthlyReportSkeleton } from './monthly-report-dashboard';

function exportMonthlyReport(report: MonthlyReport) {
  const matrix = buildMonthlyReportMatrix(report);
  const rows: Array<Array<string | number | null>> = [
    [
      'Kategoriya',
      'O‘rtacha oylik reja',
      ...MONTH_NAMES_UZ,
      'Yillik fakt',
      'Yillik reja',
      'Farq (reja−fakt)',
    ],
  ];
  const subtotalRow = (label: string, summary: MonthlyReportSectionSummary) => [
    label,
    summary.averageMonthlyPlanUzs,
    ...summary.months.map((month) => month.actualAmountUzs),
    summary.annual.actualAmountUzs,
    summary.annual.plannedAmountUzs,
    summary.annual.varianceUzs,
  ];
  for (const type of ['fixed', 'variable'] as ExpenseType[]) {
    rows.push([type === 'fixed' ? 'DOIMIY XARAJATLAR' : 'O‘ZGARUVCHAN XARAJATLAR']);
    for (const row of report.rows.filter((item) => item.category.expenseTypeSnapshot === type))
      rows.push([
        row.category.name,
        averageMonthlyPlan(row.annual.plannedAmountUzs),
        ...row.months.map((month) => month.planActual.actualAmountUzs),
        row.annual.actualAmountUzs,
        row.annual.plannedAmountUzs,
        row.annual.varianceUzs,
      ]);
    rows.push(
      subtotalRow(
        type === 'fixed' ? 'DOIMIY JAMI' : 'O‘ZGARUVCHAN JAMI',
        type === 'fixed' ? matrix.fixed : matrix.variable,
      ),
    );
  }
  rows.push(subtotalRow('UMUMIY JAMI', matrix.overall));
  rows.push([
    'DOIMIY XARAJAT ULUSHI',
    null,
    ...matrix.fixedShareByMonth.map((value) => formatPercent(value)),
    formatPercent(matrix.fixedShareAnnual),
    null,
    null,
  ]);
  downloadCsv(`oylik-hisobot-${report.year}`, rows);
}

export function MonthlyReportPage() {
  const [searchParams] = useSearchParams();
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 300_000,
  });
  const requestedPeriod = searchParams.get('period');
  const selectedPeriod = requestedPeriod
    ? periodsQuery.data?.find((period) => period.id === requestedPeriod)
    : (periodsQuery.data?.find((period) => period.status === 'open') ?? periodsQuery.data?.[0]);
  const now = new Date();
  const year = String(selectedPeriod?.year ?? now.getFullYear());
  const month = selectedPeriod?.month ?? now.getMonth() + 1;
  const branch = searchParams.get('branch') ?? 'all';
  const filterKey = `year=${year}&month=${month}&branch=${branch}`;
  const reportQuery = useQuery({
    queryKey: queryKeys.report('monthly', filterKey),
    queryFn: ({ signal }) => reportApi.monthly({ year, branch }, signal),
    enabled: Boolean(selectedPeriod),
  });
  const branchesQuery = useQuery({
    queryKey: queryKeys.report('branches', filterKey),
    queryFn: ({ signal }) => reportApi.branchComparison({ year, month, branch }, signal),
    enabled: Boolean(selectedPeriod),
  });

  const isLoading = periodsQuery.isLoading || reportQuery.isLoading || branchesQuery.isLoading;
  const hasError = periodsQuery.isError || reportQuery.isError || branchesQuery.isError;

  return (
    <div className="min-w-0 space-y-6">
      <Breadcrumbs items={[{ label: 'Hisobotlar' }, { label: 'Oylik hisobot', current: true }]} />
      <PageHeader
        title="Oylik hisobot"
        description={`Tushum, xarajat va sof foyda natijasi · ${MONTH_NAMES_UZ[month - 1]} ${year}`}
        actions={
          <Button
            variant="secondary"
            disabled={!reportQuery.data?.rows.length}
            onClick={() => reportQuery.data && exportMonthlyReport(reportQuery.data)}
          >
            <Download className="h-4 w-4" /> Yillik CSV yuklab olish
          </Button>
        }
      />
      {isLoading ? <MonthlyReportSkeleton /> : null}
      {periodsQuery.isSuccess && !selectedPeriod ? (
        <EmptyState
          title="Hisob davri mavjud emas"
          description="Oylik hisobot uchun hisob davri topilmadi."
        />
      ) : null}
      {hasError ? (
        <ErrorState
          message="Hisobotni yuklab bo‘lmadi."
          onRetry={() => {
            void periodsQuery.refetch();
            void reportQuery.refetch();
            void branchesQuery.refetch();
          }}
        />
      ) : null}
      {!isLoading && !hasError && reportQuery.data && branchesQuery.data ? (
        <MonthlyReportDashboard
          report={reportQuery.data}
          comparison={branchesQuery.data}
          month={month}
        />
      ) : null}
    </div>
  );
}
