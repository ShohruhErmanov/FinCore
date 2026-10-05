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
import { cn } from '@/shared/lib/cn';
import { formatMoney, formatPercent, toChartNumber } from '@/shared/lib/format';
import type {
  BranchComparisonReport,
  ExpenseType,
  MonthlyReport,
  PlanActual,
} from '@/shared/types/domain';
import {
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  MoneyText,
  PageHeader,
  PercentText,
  VarianceText,
} from '@/shared/ui';
import {
  averageMonthlyPlan,
  buildMonthlyReportMatrix,
  type MonthlyReportSectionSummary,
} from './monthly-report';
import { MonthlyReportDashboard, MonthlyReportSkeleton } from './monthly-report-dashboard';

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
const monthLongNames = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

/** Excel hisobotidagi kabi bajarilish foizini doimo ikki kasr bilan ko‘rsatadi. */
function FixedReportPercent({ value }: { value: number | null }) {
  const formatted = formatPercent(value, 2);
  if (formatted === '—') return <span className="tabular-nums">—</span>;
  const number = formatted.slice(0, -1);
  const separator = number.lastIndexOf(',');
  const fractionLength = separator === -1 ? 0 : number.length - separator - 1;
  const padded =
    separator === -1 ? `${number},00` : `${number}${'0'.repeat(Math.max(0, 2 - fractionLength))}`;
  return <span className="tabular-nums">{padded}%</span>;
}

function reportStatusMeta(status: PlanActual['status']) {
  const values: Record<PlanActual['status'], { label: string; className: string }> = {
    no_plan: { label: 'Reja mavjud emas', className: 'bg-slate-100 text-slate-700' },
    unplanned: { label: 'Rejadan tashqari / Unplanned', className: 'bg-amber-50 text-amber-800' },
    under_plan: { label: 'Tejash', className: 'bg-green-50 text-green-800' },
    on_plan: { label: 'Reja bilan teng', className: 'bg-sky-50 text-sky-800' },
    over_plan: { label: 'Reja oshgan', className: 'bg-red-50 text-red-800' },
  };
  return values[status];
}

function PlanActualSummary({
  title,
  data,
  helper,
  fixedCompletion = false,
}: {
  title: string;
  data: PlanActual;
  helper?: string;
  fixedCompletion?: boolean;
}) {
  const meta = reportStatusMeta(data.status);
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <span className={cn('rounded-full px-2 py-1 text-[11px] font-semibold', meta.className)}>
          {meta.label}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Reja</dt>
          <dd className="mt-1 font-bold text-ink">
            <MoneyText value={data.plannedAmountUzs} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Fakt</dt>
          <dd className="mt-1 font-bold text-ink">
            <MoneyText value={data.actualAmountUzs} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Farq</dt>
          <dd className="mt-1">
            {data.varianceUzs === null ? (
              <span className="text-muted">—</span>
            ) : (
              <VarianceText value={data.varianceUzs} />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Bajarilish</dt>
          <dd className="mt-1 font-bold text-ink">
            {fixedCompletion ? (
              <FixedReportPercent value={data.completionPercent} />
            ) : (
              <PercentText value={data.completionPercent} />
            )}
          </dd>
        </div>
      </dl>
      {helper ? <p className="mt-3 text-xs leading-5 text-muted">{helper}</p> : null}
    </div>
  );
}

type InsightTone = 'danger' | 'warning' | 'success' | 'neutral';

interface ReportInsight {
  key: string;
  text: string;
  detail: string;
  tone: InsightTone;
  priority: number;
}

const insightToneClass: Record<InsightTone, string> = {
  danger: 'border-red-200 bg-red-50/70',
  warning: 'border-amber-200 bg-amber-50/70',
  success: 'border-green-200 bg-green-50/70',
  neutral: 'border-slate-200 bg-slate-50',
};

function planActualInsight(key: string, subject: string, data: PlanActual): ReportInsight | null {
  const actual = BigInt(data.actualAmountUzs);
  const planned = data.plannedAmountUzs === null ? null : BigInt(data.plannedAmountUzs);
  if (actual === 0n && planned === null) return null;
  const detail = `Reja ${formatMoney(data.plannedAmountUzs)} · fakt ${formatMoney(data.actualAmountUzs)}`;
  if (planned === null || planned === 0n) {
    if (actual === 0n) return null;
    return {
      key,
      text: `${subject} rejasiz ${formatMoney(data.actualAmountUzs)} sarflangan.`,
      detail,
      tone: 'warning',
      priority: 10_000,
    };
  }
  const completion = data.completionPercent ?? 0;
  if (actual > planned)
    return {
      key,
      text: `${subject} rejadan ${formatPercent(completion, 0)} oshgan.`,
      detail,
      tone: 'danger',
      priority: completion,
    };
  if (actual < planned)
    return {
      key,
      text: `${subject} rejaning ${formatPercent(completion, 0)}ini tashkil qilgan.`,
      detail,
      tone: 'success',
      priority: 100 - completion,
    };
  return {
    key,
    text: `${subject} reja bilan aynan teng bajarilgan.`,
    detail,
    tone: 'neutral',
    priority: 0,
  };
}

function InsightList({
  title,
  description,
  insights,
}: {
  title: string;
  description: string;
  insights: ReportInsight[];
}) {
  const visible = [...insights].sort((a, b) => b.priority - a.priority).slice(0, 8);
  return (
    <Card title={title} description={description}>
      {visible.length ? (
        <div className="space-y-3">
          {visible.map((insight) => (
            <div
              key={insight.key}
              className={cn('rounded-xl border p-4', insightToneClass[insight.tone])}
            >
              <p className="font-semibold leading-6 text-ink">{insight.text}</p>
              <p className="mt-1 text-xs text-muted">{insight.detail}</p>
            </div>
          ))}
          {insights.length > visible.length ? (
            <p className="text-xs text-muted">
              Yana {insights.length - visible.length} ta natija CSV eksportida saqlangan.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Tanlangan kontekstda tahlil qilinadigan xarajat topilmadi.
        </p>
      )}
    </Card>
  );
}

function exportMonthlyReport(report: MonthlyReport) {
  const matrix = buildMonthlyReportMatrix(report);
  const rows: Array<Array<string | number | null>> = [
    [
      'Kategoriya',
      'O‘rtacha oylik reja',
      ...monthLongNames,
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
        description={`Tushum, xarajat va sof foyda natijasi · ${monthLongNames[month - 1]} ${year}`}
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
      line(monthLongNames[month.month - 1] ?? String(month.month), month.branches, month.total),
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
        description={`${monthLongNames[Number(month) - 1]} ${year} uchun filiallar reja-fakti va muhim og‘ishlar.`}
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
                <Bar dataKey="plan" name="Reja" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Fakt" fill="#2563eb" radius={[4, 4, 0, 0]} />
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
    color: ['#2563eb', '#14b8a6', '#f97316', '#8b5cf6'][index % 4]!,
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
                <Bar dataKey="plan" name="Reja" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Fakt" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
