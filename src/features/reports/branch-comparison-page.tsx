import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import { getApiErrorMessage } from '@/shared/api/client';
import { downloadCsv } from '@/shared/lib/csv';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { MONTH_NAMES_UZ, formatMoney, toChartNumber } from '@/shared/lib/format';
import type { BranchComparisonReport } from '@/shared/types/domain';
import {
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/shared/ui';
import { planActualInsight, type ReportInsight } from './report-insights';
import { InsightList, PlanActualSummary } from './report-summary';

const monthNames = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyun',
  'Iyul',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

function exportBranchComparison(report: BranchComparisonReport) {
  const branchNames = report.annual.branches.map((item) => item.branch.name);
  const selected = report.selectedMonth;
  const rows: Array<Array<string | number | null>> = [
    ['OYLIK XARAJATLAR — IKKI FILIAL BITTA JADVALDA'],
    ['Hisobot yili', report.year, 'Hisobot oyi', selected.month, 'Oy nomi', selected.label],
    [],
    [
      'Turi',
      'Xarajat kategoriyasi',
      ...selected.branches.flatMap((item) => [
        `${item.branch.name} reja`,
        `${item.branch.name} fakt`,
        `${item.branch.name} farq`,
      ]),
      'Ikki filial jami reja',
      'Ikki filial jami fakt',
      'Ikki filial jami farq',
    ],
    ...selected.rows.map((row) => [
      row.category.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan',
      row.category.name,
      ...selected.branches.flatMap((branch) => {
        const cell = row.branches.find((item) => item.branch.id === branch.branch.id)?.expense;
        return [
          cell?.plannedAmountUzs ?? null,
          cell?.actualAmountUzs ?? '0',
          cell?.varianceUzs ?? null,
        ];
      }),
      row.total.expense.plannedAmountUzs,
      row.total.expense.actualAmountUzs,
      row.total.expense.varianceUzs,
    ]),
    [
      'UMUMIY JAMI',
      null,
      ...selected.branches.flatMap((item) => [
        item.expense.plannedAmountUzs,
        item.expense.actualAmountUzs,
        item.expense.varianceUzs,
      ]),
      selected.total.expense.plannedAmountUzs,
      selected.total.expense.actualAmountUzs,
      selected.total.expense.varianceUzs,
    ],
    [],
    ['Filial natijasi', 'Reja', 'Fakt', 'Ishlatildi %'],
    ...selected.branches.map((item) => [
      item.branch.name,
      item.expense.plannedAmountUzs,
      item.expense.actualAmountUzs,
      item.expense.completionPercent,
    ]),
    [
      selected.total.branch.name,
      selected.total.expense.plannedAmountUzs,
      selected.total.expense.actualAmountUzs,
      selected.total.expense.completionPercent,
    ],
    [],
    ['OYLIK VA YILLIK TAQQOSLASH'],
    [
      'Oy',
      ...branchNames.flatMap((name) => [`${name} fakt`, `${name} reja`]),
      'Jami fakt',
      'Jami reja',
      'Farq (reja−fakt)',
      'Bajarilish %',
    ],
  ];
  const line = (
    label: string,
    branches: BranchComparisonReport['annual']['branches'],
    total: BranchComparisonReport['annual']['total'],
  ) => [
    label,
    ...report.annual.branches.flatMap((annualBranch) => {
      const found = branches.find((item) => item.branch.id === annualBranch.branch.id);
      return [found?.expense.actualAmountUzs ?? '0', found?.expense.plannedAmountUzs ?? '0'];
    }),
    total.expense.actualAmountUzs,
    total.expense.plannedAmountUzs,
    total.expense.varianceUzs,
    total.expense.completionPercent,
  ];
  for (const month of report.months)
    rows.push(
      line(MONTH_NAMES_UZ[month.month - 1] ?? String(month.month), month.branches, month.total),
    );
  rows.push(line('JAMI (yil)', report.annual.branches, report.annual.total));
  downloadCsv(`filiallar-taqqoslash-${report.year}`, rows);
}

export function BranchComparisonPage() {
  const [searchParams] = useSearchParams();
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 300_000,
  });
  const requestedPeriod = searchParams.get('period');
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === requestedPeriod);
  const now = new Date();
  const year = String(selectedPeriod?.year ?? now.getFullYear());
  const month = String(selectedPeriod?.month ?? now.getMonth() + 1);
  const branch = searchParams.get('branch') ?? 'all';
  const reportQuery = useQuery({
    queryKey: queryKeys.report('branches', `year=${year}&month=${month}&branch=${branch}`),
    queryFn: ({ signal }) => reportApi.branchComparison({ year, month, branch }, signal),
    enabled: !requestedPeriod || periodsQuery.isSuccess,
  });
  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Hisobotlar' }, { label: 'Filiallar taqqoslash', current: true }]}
      />
      <PageHeader
        title="Filiallar taqqoslash"
        description={`${MONTH_NAMES_UZ[Number(month) - 1]} ${year} uchun filiallar reja-fakti va muhim og‘ishlar.`}
        actions={
          <Button
            variant="secondary"
            disabled={!reportQuery.data?.months.length}
            onClick={() => reportQuery.data && exportBranchComparison(reportQuery.data)}
          >
            <Download className="h-4 w-4" /> CSV yuklab olish
          </Button>
        }
      />
      {reportQuery.isLoading || (requestedPeriod && periodsQuery.isLoading) ? (
        <LoadingState label="Filiallar hisoboti hisoblanmoqda…" />
      ) : null}
      {reportQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(reportQuery.error)}
          onRetry={() => void reportQuery.refetch()}
        />
      ) : null}
      {reportQuery.data ? <BranchComparisonContent report={reportQuery.data} /> : null}
    </div>
  );
}

function BranchMonthInsights({ report }: { report: BranchComparisonReport }) {
  const selected = report.selectedMonth;
  const branchCount = selected.branches.length;
  const showCombinedTotal = branchCount > 1;
  const resultRows = showCombinedTotal ? [...selected.branches, selected.total] : selected.branches;
  const insights = selected.rows
    .flatMap((row) =>
      row.branches.map((branch) =>
        planActualInsight(
          `${row.category.id}:${branch.branch.id}`,
          `${branch.branch.name} filialida ${row.category.name} xarajati`,
          branch.expense,
        ),
      ),
    )
    .filter((item): item is ReportInsight => item !== null);
  const chartData = selected.branches.map((item) => ({
    name: item.branch.name,
    plan: toChartNumber(item.expense.plannedAmountUzs ?? '0'),
    actual: toChartNumber(item.expense.actualAmountUzs),
  }));

  return (
    <section aria-label={`${selected.label} filiallar xulosasi`} className="mb-5 space-y-5">
      <InsightList
        title={`${selected.label} ${report.year} · muhim xulosalar`}
        description="Kategoriya va filial kesimidagi eng muhim reja-fakt og‘ishlari. To‘liq jadval CSV’da saqlanadi."
        insights={insights}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="grid gap-4">
          {resultRows.map((item) => (
            <PlanActualSummary
              key={item.branch.id}
              title={item.branch.name}
              data={item.expense}
              fixedCompletion
            />
          ))}
        </div>
        <Card title={`${selected.label}: Reja / Fakt`} description="Filiallar kesimi, UZS">
          <div
            role="img"
            aria-label={`${selected.label} filiallar reja va fakt diagrammasi`}
            className="h-80 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis
                  tickFormatter={(value: number) => formatMoney(String(value))}
                  fontSize={11}
                  width={130}
                />
                <Tooltip formatter={(value) => formatMoney(String(value))} />
                <Legend />
                <Bar dataKey="plan" name="Reja" fill="var(--chart-plan)" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="actual"
                  name="Fakt"
                  fill="var(--chart-actual)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </section>
  );
}

function BranchComparisonContent({ report }: { report: BranchComparisonReport }) {
  const reportBranches = report.annual.branches;
  if (reportBranches.length === 0)
    return (
      <EmptyState
        title="Filial ma’lumoti mavjud emas"
        description="Tanlangan navbar filtrlari va foydalanuvchining filial ruxsatlarini tekshiring."
      />
    );
  const showCombinedTotal = reportBranches.length > 1;
  const chartSeries = reportBranches.map((item, index) => ({
    dataKey: `branch${index + 1}`,
    branch: item.branch,
    color: [
      'var(--chart-actual)',
      'var(--chart-danger)',
      'var(--chart-warning)',
      'var(--chart-success)',
    ][index % 4]!,
  }));
  const expenseChart = report.months.map((item) => ({
    month: monthNames[item.month - 1],
    ...Object.fromEntries(
      chartSeries.map((series) => [
        series.dataKey,
        toChartNumber(
          item.branches.find((branch) => branch.branch.id === series.branch.id)?.expense
            .actualAmountUzs ?? '0',
        ),
      ]),
    ),
  }));
  const annualChart = report.annual.branches.map((item) => ({
    name: item.branch.name,
    plan: toChartNumber(item.expense.plannedAmountUzs ?? '0'),
    actual: toChartNumber(item.expense.actualAmountUzs),
  }));
  return (
    <>
      <BranchMonthInsights report={report} />
      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        {(showCombinedTotal ? [...reportBranches, report.annual.total] : reportBranches).map(
          (summary) => (
            <Card
              key={summary.branch.id}
              title={summary.branch.name}
              description={`${report.year} yil server agregati`}
            >
              <PlanActualSummary title="Xarajat reja-fakt" data={summary.expense} fixedCompletion />
            </Card>
          ),
        )}
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card title="Oylar bo‘yicha filial xarajatlari" description="Haqiqiy xarajat, UZS">
          <div
            role="img"
            aria-label={`${reportBranches.map((item) => item.branch.name).join(' va ')} oylar bo‘yicha xarajat ustunli grafigi`}
            className="h-80 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis
                  tickFormatter={(value: number) => formatMoney(String(value))}
                  fontSize={11}
                  width={130}
                />
                <Tooltip formatter={(value) => formatMoney(String(value))} />
                <Legend />
                {chartSeries.map((series) => (
                  <Bar
                    key={series.branch.id}
                    dataKey={series.dataKey}
                    name={series.branch.name}
                    fill={series.color}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Yillik xarajat: Reja / Fakt" description="Filiallar kesimi, UZS">
          <div
            role="img"
            aria-label="Filiallar yillik xarajat reja va fakt ustunli grafigi"
            className="h-80 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={annualChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis
                  tickFormatter={(value: number) => formatMoney(String(value))}
                  fontSize={11}
                  width={130}
                />
                <Tooltip formatter={(value) => formatMoney(String(value))} />
                <Legend />
                <Bar dataKey="plan" name="Reja" fill="var(--chart-plan)" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="actual"
                  name="Fakt"
                  fill="var(--chart-actual)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
