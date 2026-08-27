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
import { formatMoney, formatPercent, toChartNumber } from '@/shared/lib/format';
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
import {
  averageMonthlyPlan,
  buildMonthlyReportMatrix,
  type MonthlyMoneySummary,
  type MonthlyReportSectionSummary,
} from './monthly-report';

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

function ReportFilters({
  year,
  month,
  branch,
  onYear,
  onMonth,
  onBranch,
  showMonth = false,
  showBranch = true,
}: {
  year: string;
  month?: string;
  branch: string;
  onYear: (value: string) => void;
  onMonth?: (value: string) => void;
  onBranch: (value: string) => void;
  showMonth?: boolean;
  showBranch?: boolean;
}) {
  const selectedYear = Number(year);
  const currentYear = new Date().getFullYear();
  const years = [
    ...new Set([selectedYear, ...Array.from({ length: 7 }, (_, index) => currentYear - 4 + index)]),
  ]
    .filter((value) => Number.isInteger(value) && value >= 2000 && value <= 2100)
    .sort((a, b) => b - a);
  const branchesQuery = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
    staleTime: 300_000,
  });
  return (
    <Card title="Hisobot filtrlari" className="mb-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
        <FormField label="Yil" htmlFor={`report-year-${showBranch ? 'branch' : 'single'}`}>
          <Select
            id={`report-year-${showBranch ? 'branch' : 'single'}`}
            value={year}
            onChange={(event) => onYear(event.target.value)}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </FormField>
        {showMonth ? (
          <FormField label="Oy" htmlFor="report-month">
            <Select
              id="report-month"
              value={month}
              onChange={(event) => onMonth?.(event.target.value)}
            >
              {monthLongNames.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
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

function MonthlySummaryCell({ value }: { value: MonthlyMoneySummary }) {
  return (
    <div className="min-w-32 px-2 py-2 text-right">
      <p className="font-bold tabular-nums">
        <MoneyText value={value.actualAmountUzs} compact />
      </p>
      <p className="mt-1 text-[11px] opacity-75">
        Reja: <MoneyText value={value.plannedAmountUzs} compact />
      </p>
    </div>
  );
}

function SectionHeaderRow({ title, tone }: { title: string; tone: 'fixed' | 'variable' }) {
  return (
    <tr>
      <th
        colSpan={17}
        className={cn(
          'sticky left-0 z-10 px-4 py-3 text-left text-sm font-extrabold uppercase tracking-wide',
          tone === 'fixed' ? 'bg-blue-100 text-blue-950' : 'bg-orange-100 text-orange-950',
        )}
      >
        {title}
      </th>
    </tr>
  );
}

function MonthlySubtotalRow({
  label,
  summary,
  tone,
}: {
  label: string;
  summary: MonthlyReportSectionSummary;
  tone: 'fixed' | 'variable' | 'overall';
}) {
  const rowTone = {
    fixed: 'bg-blue-50 text-blue-950',
    variable: 'bg-orange-50 text-orange-950',
    overall: 'bg-emerald-100 text-emerald-950',
  }[tone];
  return (
    <tr className={cn('border-y border-border font-bold', rowTone)}>
      <th scope="row" className={cn('sticky left-0 z-10 px-4 py-3 text-left', rowTone)}>
        {label}
      </th>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <MoneyText value={summary.averageMonthlyPlanUzs} compact />
      </td>
      {summary.months.map((month, index) => (
        <td key={index} className="px-1 py-1">
          <MonthlySummaryCell value={month} />
        </td>
      ))}
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <MoneyText value={summary.annual.actualAmountUzs} compact />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <MoneyText value={summary.annual.plannedAmountUzs} compact />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {summary.annual.varianceUzs === null ? (
          '—'
        ) : (
          <VarianceText value={summary.annual.varianceUzs} />
        )}
      </td>
    </tr>
  );
}

function MonthlyCategoryRow({
  row,
  year,
  branch,
}: {
  row: MonthlyReportRow;
  year: number;
  branch: string;
}) {
  return (
    <tr className="border-b border-border bg-white">
      <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-left">
        <p className="font-semibold text-ink">{row.category.name}</p>
        <p className="mt-1 text-xs text-muted">{row.category.code}</p>
      </th>
      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
        <MoneyText value={averageMonthlyPlan(row.annual.plannedAmountUzs)} compact />
      </td>
      {row.months.map((month) => (
        <td key={month.month} className="px-1 py-1">
          <MonthlyCell row={row} month={month} year={year} branch={branch} />
        </td>
      ))}
      <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-ink">
        <MoneyText value={row.annual.actualAmountUzs} compact />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
        <MoneyText value={row.annual.plannedAmountUzs} compact />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {row.annual.varianceUzs === null ? '—' : <VarianceText value={row.annual.varianceUzs} />}
      </td>
    </tr>
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
        title="Oylik hisobot"
        description="Excel matritsasiga mos: doimiy va o‘zgaruvchan xarajatlar, 12 oy, yillik fakt, reja va farq. Fakt katagidan Jurnalga o‘ting."
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
  const matrix = buildMonthlyReportMatrix(report);
  const fixedRows = report.rows.filter((row) => row.category.expenseTypeSnapshot === 'fixed');
  const variableRows = report.rows.filter((row) => row.category.expenseTypeSnapshot === 'variable');
  return (
    <>
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <PlanActualSummary title="Doimiy jami" data={report.totals.fixed} />
        <PlanActualSummary title="O‘zgaruvchan jami" data={report.totals.variable} />
        <PlanActualSummary title="Umumiy jami" data={report.totals.overall} />
      </div>
      <Alert title="Excel bilan bir xil hisoblash tartibi" tone="info" className="mb-5">
        “O‘rtacha oylik reja” yillik reja yig‘indisini 12 kalendar oyga bo‘lish orqali hisoblanadi.
        Fakt mavjud oylar: <strong>{report.averagePolicy.denominator} ta</strong>. Reja mavjud
        bo‘lmagan davrlar “reja yo‘q” holatida qoladi, nol reja deb talqin qilinmaydi.
      </Alert>
      <Card
        title={`${report.year} yil · Oylik hisobot matritsasi`}
        description="Excel tartibi saqlangan. Oy katagida yuqorida fakt, pastda shu oy rejasi ko‘rsatiladi."
        className="overflow-hidden"
      >
        <div className="-m-5 overflow-x-auto">
          <table className="min-w-[2450px] w-full text-sm">
            <caption className="sr-only">{report.year} yil oylik plan-fakt hisoboti</caption>
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-64 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Kategoriya
                </th>
                <th
                  scope="col"
                  className="min-w-40 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  O‘rtacha oylik reja
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
                  Yillik fakt
                </th>
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
                  Farq
                </th>
              </tr>
            </thead>
            <tbody>
              <SectionHeaderRow title="Doimiy xarajatlar" tone="fixed" />
              {fixedRows.map((row) => (
                <MonthlyCategoryRow
                  key={row.category.id}
                  row={row}
                  year={report.year}
                  branch={report.branchFilter}
                />
              ))}
              <MonthlySubtotalRow label="DOIMIY JAMI" summary={matrix.fixed} tone="fixed" />

              <SectionHeaderRow title="O‘zgaruvchan xarajatlar" tone="variable" />
              {variableRows.map((row) => (
                <MonthlyCategoryRow
                  key={row.category.id}
                  row={row}
                  year={report.year}
                  branch={report.branchFilter}
                />
              ))}
              <MonthlySubtotalRow
                label="O‘ZGARUVCHAN JAMI"
                summary={matrix.variable}
                tone="variable"
              />
              <MonthlySubtotalRow label="UMUMIY JAMI" summary={matrix.overall} tone="overall" />
              <tr className="border-y border-border bg-violet-50 font-semibold text-violet-950">
                <th scope="row" className="sticky left-0 z-10 bg-violet-50 px-4 py-3 text-left">
                  DOIMIY XARAJAT ULUSHI
                </th>
                <td className="px-4 py-3 text-right text-muted">—</td>
                {matrix.fixedShareByMonth.map((value, index) => (
                  <td key={index} className="px-3 py-3 text-right tabular-nums">
                    {formatPercent(value)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-bold tabular-nums">
                  {formatPercent(matrix.fixedShareAnnual)}
                </td>
                <td className="px-4 py-3 text-right text-muted">—</td>
                <td className="px-4 py-3 text-right text-muted">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
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
  const legacyYear = Number(searchParams.get('year'));
  const legacyMonth = Number(searchParams.get('month'));
  const now = new Date();
  const year = String(
    selectedPeriod?.year ??
      (Number.isInteger(legacyYear) && legacyYear >= 2000 && legacyYear <= 2100
        ? legacyYear
        : now.getFullYear()),
  );
  const month = String(
    selectedPeriod?.month ??
      (Number.isInteger(legacyMonth) && legacyMonth >= 1 && legacyMonth <= 12
        ? legacyMonth
        : now.getMonth() + 1),
  );
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
        description="Excel’dagi «2_filial_bitta_jadval»: tanlangan oyda kategoriya kesimi, ikki filial reja-fakti va mavjud yillik taqqoslashlar."
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

function ExpensePlanActualCells({ data }: { data: PlanActual }) {
  return (
    <>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <MoneyText value={data.plannedAmountUzs} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">
        <MoneyText value={data.actualAmountUzs} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {data.varianceUzs === null ? '—' : <VarianceText value={data.varianceUzs} />}
      </td>
    </>
  );
}

function TwoBranchMonthMatrix({ report }: { report: BranchComparisonReport }) {
  const selected = report.selectedMonth;
  const branchCount = selected.branches.length;
  const showCombinedTotal = branchCount > 1;
  const resultRows = showCombinedTotal ? [...selected.branches, selected.total] : selected.branches;
  const chartData = selected.branches.map((item) => ({
    name: item.branch.name,
    plan: toChartNumber(item.expense.plannedAmountUzs ?? '0'),
    actual: toChartNumber(item.expense.actualAmountUzs),
  }));

  return (
    <section aria-labelledby="two-branch-month-title" className="mb-5 space-y-5">
      <Card
        title={
          showCombinedTotal
            ? 'Oylik xarajatlar — ikki filial bitta jadvalda'
            : `Oylik xarajatlar — ${selected.branches[0]?.branch.name ?? 'filial kesimi'}`
        }
        description={`${report.year} yil · ${selected.label}. Reja tasdiqlangan budjetdan, fakt Jurnalning server agregatidan olinadi.`}
        className="overflow-hidden"
      >
        <h2 id="two-branch-month-title" className="sr-only">
          Ikki filial bitta jadval
        </h2>
        {selected.rows.length === 0 ? (
          <EmptyState
            title="Tanlangan oy uchun kategoriya ma’lumoti yo‘q"
            description="Hisob davri yoki ruxsat doirasidagi filiallar mavjudligini tekshiring."
          />
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table
              aria-label={`${selected.label} ikki filial bitta jadval`}
              className="w-full min-w-[1900px] text-sm"
            >
              <thead>
                <tr className="border-b border-white text-xs font-extrabold uppercase tracking-wide text-white">
                  <th rowSpan={2} className="bg-slate-800 px-4 py-3 text-left">
                    Turi
                  </th>
                  <th rowSpan={2} className="bg-slate-800 px-4 py-3 text-left">
                    Xarajat kategoriyasi
                  </th>
                  {selected.branches.map((item, index) => (
                    <th
                      key={item.branch.id}
                      colSpan={3}
                      className={cn(
                        'px-4 py-3 text-center',
                        index === 0 ? 'bg-blue-800' : 'bg-orange-700',
                      )}
                    >
                      {item.branch.name} filiali
                    </th>
                  ))}
                  {showCombinedTotal ? (
                    <th colSpan={3} className="bg-emerald-700 px-4 py-3 text-center">
                      Ikki filial jami
                    </th>
                  ) : null}
                </tr>
                <tr className="border-b border-white text-xs font-semibold uppercase tracking-wide text-white">
                  {selected.branches.map((item, index) =>
                    ['Reja', 'Fakt', 'Farq'].map((label) => (
                      <th
                        key={`${item.branch.id}:${label}`}
                        className={cn(
                          'px-4 py-3 text-right',
                          index === 0 ? 'bg-blue-800' : 'bg-orange-700',
                        )}
                      >
                        {label}
                      </th>
                    )),
                  )}
                  {showCombinedTotal
                    ? ['Reja', 'Fakt', 'Farq'].map((label) => (
                        <th key={label} className="bg-emerald-700 px-4 py-3 text-right">
                          {label}
                        </th>
                      ))
                    : null}
                </tr>
              </thead>
              <tbody>
                {selected.rows.map((row) => (
                  <tr
                    key={row.category.id}
                    className="border-b border-border bg-white last:border-0"
                  >
                    <td className="px-4 py-3 text-muted">
                      {row.category.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                    </td>
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                      {row.category.name}
                    </th>
                    {selected.branches.map((branch) => {
                      const cell = row.branches.find((item) => item.branch.id === branch.branch.id);
                      return cell ? (
                        <ExpensePlanActualCells key={branch.branch.id} data={cell.expense} />
                      ) : (
                        <td key={branch.branch.id} colSpan={3} className="px-4 py-3 text-center">
                          —
                        </td>
                      );
                    })}
                    {showCombinedTotal ? <ExpensePlanActualCells data={row.total.expense} /> : null}
                  </tr>
                ))}
                <tr className="border-t-4 border-slate-800 bg-slate-100 font-bold text-slate-950">
                  <th
                    scope="row"
                    colSpan={2}
                    className="px-4 py-4 text-left text-sm uppercase tracking-wide"
                  >
                    Umumiy jami
                  </th>
                  {selected.branches.map((item) => (
                    <ExpensePlanActualCells key={item.branch.id} data={item.expense} />
                  ))}
                  {showCombinedTotal ? (
                    <ExpensePlanActualCells data={selected.total.expense} />
                  ) : null}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card
          title="Filial natijasi"
          description={`${selected.label} · Reja, fakt va ishlatilgan budjet ulushi`}
        >
          <div className="-m-5 overflow-x-auto">
            <table aria-label="Filial natijasi" className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border bg-blue-800 text-xs font-semibold uppercase tracking-wide text-white">
                  <th className="px-4 py-3 text-left">Filial</th>
                  <th className="px-4 py-3 text-right">Reja</th>
                  <th className="px-4 py-3 text-right">Fakt</th>
                  <th className="px-4 py-3 text-right">Ishlatildi %</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map((item) => (
                  <tr key={item.branch.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                      {item.branch.name}
                    </th>
                    <td className="px-4 py-3 text-right">
                      <MoneyText value={item.expense.plannedAmountUzs} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      <MoneyText value={item.expense.actualAmountUzs} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      <FixedReportPercent value={item.expense.completionPercent} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
      <TwoBranchMonthMatrix report={report} />
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
                  tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}m`}
                  fontSize={11}
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
          <table className="w-full min-w-[1540px] text-sm">
            <caption className="sr-only">
              {report.year} yil filiallar oylik taqqoslash jadvali
            </caption>
            <thead>
              <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3 text-left">Oy</th>
                {report.annual.branches.map((branch) => (
                  <th key={`${branch.branch.id}:actual`} className="px-4 py-3 text-right">
                    {branch.branch.name} fakt
                  </th>
                ))}
                {showCombinedTotal ? <th className="px-4 py-3 text-right">Jami fakt</th> : null}
                {report.annual.branches.map((branch) => (
                  <th key={`${branch.branch.id}:plan`} className="px-4 py-3 text-right">
                    {branch.branch.name} reja
                  </th>
                ))}
                {showCombinedTotal ? <th className="px-4 py-3 text-right">Jami reja</th> : null}
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
                      <td key={`${annualBranch.branch.id}:actual`} className="px-4 py-3 text-right">
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
                  {showCombinedTotal ? (
                    <td className="px-4 py-3 text-right font-bold">
                      <MoneyText value={month.total.expense.actualAmountUzs} compact />
                    </td>
                  ) : null}
                  {report.annual.branches.map((annualBranch) => {
                    const row = month.branches.find(
                      (item) => item.branch.id === annualBranch.branch.id,
                    );
                    return (
                      <td key={`${annualBranch.branch.id}:plan`} className="px-4 py-3 text-right">
                        <MoneyText value={row?.expense.plannedAmountUzs ?? null} compact />
                      </td>
                    );
                  })}
                  {showCombinedTotal ? (
                    <td className="px-4 py-3 text-right">
                      <MoneyText value={month.total.expense.plannedAmountUzs} compact />
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-right">
                    {month.total.expense.varianceUzs === null ? (
                      '—'
                    ) : (
                      <VarianceText value={month.total.expense.varianceUzs} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <FixedReportPercent value={month.total.expense.completionPercent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card
        title="Yillik yakun"
        description="Excel shaklidagi filial kesimida yillik fakt, reja va reja bajarilishi."
        className="mt-5 overflow-hidden"
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">
              {report.year} yil filiallar yillik fakt, reja va reja bajarilishi
            </caption>
            <thead>
              <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3 text-left">Filial</th>
                <th className="px-4 py-3 text-right">Yillik fakt</th>
                <th className="px-4 py-3 text-right">Yillik reja</th>
                <th className="px-4 py-3 text-right">Reja bajarilishi</th>
              </tr>
            </thead>
            <tbody>
              {report.annual.branches.map((summary) => (
                <tr key={summary.branch.id} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                    {summary.branch.name}
                  </th>
                  <td className="px-4 py-3 text-right font-bold">
                    <MoneyText value={summary.expense.actualAmountUzs} compact />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MoneyText value={summary.expense.plannedAmountUzs} compact />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <FixedReportPercent value={summary.expense.completionPercent} />
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
