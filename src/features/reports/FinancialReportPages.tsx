import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
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
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { formatMoney, toChartNumber } from '@/shared/lib/format';
import { drilldownUrl } from '@/shared/lib/url';
import type {
  BranchComparisonReport,
  ExpenseType,
  MonthlyReport,
  MonthlyReportRow,
  PlanActual,
} from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  MoneyText,
  PageHeader,
  PercentText,
  Select,
  VarianceText,
} from '@/shared/ui';

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
}: {
  title: string;
  data: PlanActual;
  helper?: string;
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
            <PercentText value={data.completionPercent} />
          </dd>
        </div>
      </dl>
      {helper ? <p className="mt-3 text-xs leading-5 text-muted">{helper}</p> : null}
    </div>
  );
}

function ReportFilters({
  year,
  branch,
  onYear,
  onBranch,
  showBranch = true,
}: {
  year: string;
  branch: string;
  onYear: (value: string) => void;
  onBranch: (value: string) => void;
  showBranch?: boolean;
}) {
  const branchesQuery = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
    staleTime: 300_000,
  });
  return (
    <Card title="Hisobot filtrlari" className="mb-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <FormField label="Yil" htmlFor={`report-year-${showBranch ? 'branch' : 'single'}`}>
          <Select
            id={`report-year-${showBranch ? 'branch' : 'single'}`}
            value={year}
            onChange={(event) => onYear(event.target.value)}
          >
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </Select>
        </FormField>
        {showBranch ? (
          <FormField label="Filial" htmlFor="report-branch">
            <Select
              id="report-branch"
              value={branch}
              onChange={(event) => onBranch(event.target.value)}
            >
              <option value="all">Barchasi</option>
              {(branchesQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </div>
    </Card>
  );
}

function MonthlyCell({
  row,
  month,
  year,
  branch,
}: {
  row: MonthlyReportRow;
  month: MonthlyReportRow['months'][number];
  year: number;
  branch: string;
}) {
  const meta = reportStatusMeta(month.planActual.status);
  const content = (
    <div className="min-w-32 rounded-lg border border-transparent p-2 text-right hover:border-blue-200 hover:bg-blue-50/60">
      <p className="font-bold text-ink">
        <MoneyText value={month.planActual.actualAmountUzs} compact />
      </p>
      <p className="mt-1 text-[11px] text-muted">
        Reja: <MoneyText value={month.planActual.plannedAmountUzs} compact />
      </p>
      <p
        className={cn(
          'mt-1 text-[10px] font-semibold',
          meta.className.replace('bg-', 'text-').split(' ')[1] ?? 'text-muted',
        )}
      >
        {meta.label}
      </p>
    </div>
  );
  if (month.transactionCount === 0) return content;
  return (
    <Link
      aria-label={`${row.category.name}, ${monthLongNames[month.month - 1]} tranzaksiyalarini ochish`}
      to={drilldownUrl(routes.expenses, {
        year: String(year),
        month: String(month.month),
        branch,
        category: row.category.id,
      })}
    >
      {content}
    </Link>
  );
}

function exportMonthlyReport(report: MonthlyReport) {
  const typeLabel = (type: ExpenseType) => (type === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan');
  const rows: Array<Array<string | number | null>> = [
    [
      'Kategoriya',
      'Turi',
      ...monthLongNames.flatMap((month) => [`${month} reja`, `${month} fakt`]),
      'Yillik reja',
      'Yillik fakt',
      'Farq (reja−fakt)',
    ],
  ];
  for (const type of ['fixed', 'variable'] as ExpenseType[])
    for (const row of report.rows.filter((item) => item.category.expenseTypeSnapshot === type))
      rows.push([
        row.category.name,
        typeLabel(type),
        ...row.months.flatMap((month) => [
          month.planActual.plannedAmountUzs,
          month.planActual.actualAmountUzs,
        ]),
        row.annual.plannedAmountUzs,
        row.annual.actualAmountUzs,
        row.annual.varianceUzs,
      ]);
  const totalRow = (label: string, total: PlanActual) => [
    label,
    '',
    ...Array.from({ length: 24 }, () => ''),
    total.plannedAmountUzs,
    total.actualAmountUzs,
    total.varianceUzs,
  ];
  rows.push(totalRow('DOIMIY JAMI', report.totals.fixed));
  rows.push(totalRow('O‘ZGARUVCHAN JAMI', report.totals.variable));
  rows.push(totalRow('UMUMIY JAMI', report.totals.overall));
  downloadCsv(`oylik-hisobot-${report.year}`, rows);
}

export function MonthlyReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const year = searchParams.get('year') ?? '2026';
  const branch = searchParams.get('branch') ?? 'all';
  const filterKey = `year=${year}&branch=${branch}`;
  const reportQuery = useQuery({
    queryKey: queryKeys.report('monthly', filterKey),
    queryFn: ({ signal }) => reportApi.monthly({ year, branch }, signal),
  });
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Hisobotlar' }, { label: 'Oylik hisobot', current: true }]} />
      <PageHeader
        title="Oylik plan–fakt hisoboti"
        description="Kategoriya × oy kesimidagi server agregatlari. Har bir fakt katagidan filtrlangan jurnalga o‘ting."
        actions={
          <Button
            variant="secondary"
            disabled={!reportQuery.data?.rows.length}
            onClick={() => reportQuery.data && exportMonthlyReport(reportQuery.data)}
          >
            <Download className="h-4 w-4" /> CSV yuklab olish
          </Button>
        }
      />
      <ReportFilters
        year={year}
        branch={branch}
        onYear={(value) => setFilter('year', value)}
        onBranch={(value) => setFilter('branch', value)}
      />
      {reportQuery.isLoading ? <LoadingState label="Oylik hisobot hisoblanmoqda…" /> : null}
      {reportQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(reportQuery.error)}
          onRetry={() => void reportQuery.refetch()}
        />
      ) : null}
      {reportQuery.data ? <MonthlyReportContent report={reportQuery.data} /> : null}
    </div>
  );
}

function MonthlyReportContent({ report }: { report: MonthlyReport }) {
  if (!report.rows.length)
    return (
      <EmptyState
        title="Hisobot ma’lumoti yo‘q"
        description="Tanlangan yil va filial uchun kategoriya agregatlari topilmadi."
      />
    );
  return (
    <>
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <PlanActualSummary title="Doimiy subtotal" data={report.totals.fixed} />
        <PlanActualSummary title="O‘zgaruvchan subtotal" data={report.totals.variable} />
        <PlanActualSummary
          title="Umumiy jami"
          data={report.totals.overall}
          helper={`${report.averagePolicy.label}; aniq maxraj: ${report.averagePolicy.denominator} oy.`}
        />
      </div>
      <Alert title="O‘rtacha KPI siyosati aniq" tone="info" className="mb-5">
        {report.averagePolicy.label}. Backend qaytargan denominator:{' '}
        <strong>{report.averagePolicy.denominator} oy</strong>; “o‘rtacha” noaniq 12 oy deb
        olinmaydi.
      </Alert>
      <Card
        title={`${report.year} yil · kategoriya × oy`}
        description="Katakda yuqorida fakt, pastda reja ko‘rsatiladi."
        className="overflow-hidden"
      >
        <div className="-m-5 overflow-x-auto">
          <table className="min-w-[2250px] w-full text-sm">
            <caption className="sr-only">{report.year} yil oylik plan-fakt hisoboti</caption>
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-64 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Kategoriya
                </th>
                {monthLongNames.map((month) => (
                  <th
                    key={month}
                    scope="col"
                    className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {month}
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Yillik reja
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Yillik fakt
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Farq
                </th>
              </tr>
            </thead>
            <tbody>
              {(['fixed', 'variable'] as ExpenseType[]).map((type) => {
                const rows = report.rows.filter((row) => row.category.expenseTypeSnapshot === type);
                return rows.map((row, index) => (
                  <tr key={row.category.id} className="border-b border-border last:border-0">
                    <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-left">
                      <p className="font-semibold text-ink">{row.category.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {index === 0
                          ? type === 'fixed'
                            ? 'Doimiy xarajatlar'
                            : 'O‘zgaruvchan xarajatlar'
                          : type === 'fixed'
                            ? 'Doimiy'
                            : 'O‘zgaruvchan'}
                      </p>
                    </th>
                    {row.months.map((month) => (
                      <td key={month.month} className="px-1 py-1">
                        <MonthlyCell
                          row={row}
                          month={month}
                          year={report.year}
                          branch={report.branchFilter}
                        />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      <MoneyText value={row.annual.plannedAmountUzs} compact />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-ink">
                      <MoneyText value={row.annual.actualAmountUzs} compact />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {row.annual.varianceUzs === null ? (
                        '—'
                      ) : (
                        <VarianceText value={row.annual.varianceUzs} />
                      )}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function exportBranchComparison(report: BranchComparisonReport) {
  const branchNames = report.annual.branches.map((item) => item.branch.name);
  const rows: Array<Array<string | number | null>> = [
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
    rows.push(line(monthLongNames[month.month - 1] ?? String(month.month), month.branches, month.total));
  rows.push(line('JAMI (yil)', report.annual.branches, report.annual.total));
  downloadCsv(`filiallar-taqqoslash-${report.year}`, rows);
}

export function BranchComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const year = searchParams.get('year') ?? '2026';
  const reportQuery = useQuery({
    queryKey: queryKeys.report('branches', `year=${year}`),
    queryFn: ({ signal }) => reportApi.branchComparison({ year }, signal),
  });
  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Hisobotlar' }, { label: 'Filiallar taqqoslash', current: true }]}
      />
      <PageHeader
        title="Filiallar taqqoslash"
        description="Sayxun va Xalqlar do‘stligi xarajat reja-faktlarini bitta source of truth’dan solishtiring."
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
      <ReportFilters
        year={year}
        branch="all"
        showBranch={false}
        onYear={(value) => setSearchParams({ year: value }, { replace: true })}
        onBranch={() => undefined}
      />
      {reportQuery.isLoading ? <LoadingState label="Filiallar hisoboti hisoblanmoqda…" /> : null}
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

function BranchComparisonContent({ report }: { report: BranchComparisonReport }) {
  const branchA = report.annual.branches[0];
  const branchB = report.annual.branches[1];
  if (!branchA || !branchB)
    return (
      <EmptyState
        title="Ikki filial ma’lumoti to‘liq emas"
        description="V1 taqqoslash hisoboti Sayxun va Xalqlar do‘stligi agregatlarini kutadi."
      />
    );
  const expenseChart = report.months.map((item) => ({
    month: monthNames[item.month - 1],
    branchA: toChartNumber(
      item.branches.find((branch) => branch.branch.id === branchA.branch.id)?.expense
        .actualAmountUzs ?? '0',
    ),
    branchB: toChartNumber(
      item.branches.find((branch) => branch.branch.id === branchB.branch.id)?.expense
        .actualAmountUzs ?? '0',
    ),
  }));
  const annualChart = report.annual.branches.map((item) => ({
    name: item.branch.name,
    plan: toChartNumber(item.expense.plannedAmountUzs ?? '0'),
    actual: toChartNumber(item.expense.actualAmountUzs),
  }));
  return (
    <>
      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        {[...report.annual.branches, report.annual.total].map((summary) => (
          <Card
            key={summary.branch.id}
            title={summary.branch.name}
            description={`${report.year} yil server agregati`}
          >
            <PlanActualSummary title="Xarajat reja-fakt" data={summary.expense} />
          </Card>
        ))}
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card title="Oylar bo‘yicha filial xarajatlari" description="Haqiqiy xarajat, UZS">
          <div
            role="img"
            aria-label={`${branchA.branch.name} va ${branchB.branch.name} oylar bo‘yicha xarajat ustunli grafigi`}
            className="h-80 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis
                  tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}m`}
                  fontSize={11}
                />
                <Tooltip formatter={(value) => formatMoney(String(value))} />
                <Legend />
                <Bar
                  dataKey="branchA"
                  name={branchA.branch.name}
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="branchB"
                  name={branchB.branch.name}
                  fill="#14b8a6"
                  radius={[4, 4, 0, 0]}
                />
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
                  tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}m`}
                  fontSize={11}
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
      <Card
        title="Oylik taqqoslash jadvali"
        description="Grafikning matnli/jadval fallback’i va tranzaksiya drill-downi."
        className="overflow-hidden"
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <caption className="sr-only">
              {report.year} yil filiallar oylik taqqoslash jadvali
            </caption>
            <thead>
              <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3 text-left">Oy</th>
                {report.annual.branches.map((branch) => (
                  <th key={branch.branch.id} className="px-4 py-3 text-right">
                    {branch.branch.name} fakt
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Jami fakt</th>
                <th className="px-4 py-3 text-right">Jami reja</th>
                <th className="px-4 py-3 text-right">Farq</th>
                <th className="px-4 py-3 text-right">Bajarilish</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((month) => (
                <tr key={month.month} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                    {monthLongNames[month.month - 1]}
                  </th>
                  {report.annual.branches.map((annualBranch) => {
                    const row = month.branches.find(
                      (item) => item.branch.id === annualBranch.branch.id,
                    );
                    return (
                      <td key={annualBranch.branch.id} className="px-4 py-3 text-right">
                        <Link
                          className="font-semibold text-primary hover:underline"
                          to={drilldownUrl(routes.expenses, {
                            year: String(report.year),
                            month: String(month.month),
                            branch: annualBranch.branch.id,
                          })}
                        >
                          <MoneyText value={row?.expense.actualAmountUzs ?? '0'} compact />
                        </Link>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-bold">
                    <MoneyText value={month.total.expense.actualAmountUzs} compact />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MoneyText value={month.total.expense.plannedAmountUzs} compact />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {month.total.expense.varianceUzs === null ? (
                      '—'
                    ) : (
                      <VarianceText value={month.total.expense.varianceUzs} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <PercentText value={month.total.expense.completionPercent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
