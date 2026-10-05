import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/shared/lib/cn';
import { formatMoney, formatPercent, monthNameUz, toChartNumber } from '@/shared/lib/format';
import type { BranchComparisonReport, MonthlyReport, PlanActual } from '@/shared/types/domain';
import { EmptyState, MoneyText, PercentText } from '@/shared/ui';
import { buildMonthlyExecutiveSummary, type MonthlyExecutiveSummary } from './monthly-report';

const surface =
  'rounded-[1.5rem] border border-slate-200/80 bg-white shadow-[0_18px_48px_-40px_rgba(15,23,42,0.38)]';
const shortMonths = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyn',
  'Iyl',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

function varianceLabel(data: PlanActual): string {
  if (!data.hasPlan || data.plannedAmountUzs === null)
    return BigInt(data.actualAmountUzs) > 0n ? 'Rejasiz xarajat' : 'Reja mavjud emas';
  const difference = BigInt(data.varianceUzs ?? '0');
  if (difference > 0n) return 'Rejadan kam sarflangan';
  if (difference < 0n) return 'Rejadan oshgan';
  return 'Reja bilan bir xil';
}

function completion(data: PlanActual): ReactNode {
  return data.completionPercent === null ? (
    'Reja mavjud emas'
  ) : (
    <PercentText value={data.completionPercent} />
  );
}

function Amount({ value, className }: { value: string | null; className?: string }) {
  return <MoneyText value={value} className={cn('break-words', className)} />;
}

function Heading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

function MiniMetric({ label, value, helper }: { label: string; value: ReactNode; helper: string }) {
  return (
    <article className={cn(surface, 'min-w-0 p-4')}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-[clamp(1.2rem,1.7vw,1.6rem)] font-semibold leading-tight tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{helper}</p>
    </article>
  );
}

function Overview({ summary, year }: { summary: MonthlyExecutiveSummary; year: number }) {
  const total = summary.overall;
  const isOver = total.varianceUzs !== null && BigInt(total.varianceUzs) < 0n;
  return (
    <section aria-label="Oylik moliyaviy natija" className="space-y-3">
      <div className={cn(surface, 'overflow-hidden p-5 sm:p-6')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {summary.monthLabel} {year}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Oylik moliyaviy natija
            </h2>
          </div>
          <span
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold',
              isOver ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700',
            )}
          >
            {varianceLabel(total)}
          </span>
        </div>
        <div className="mt-4">
          <p className="text-xs text-slate-500">Amaldagi xarajat</p>
          <p className="mt-1 break-words text-[clamp(1.8rem,3.5vw,3rem)] font-semibold leading-[1.1] tracking-[-0.04em] text-slate-950">
            <Amount value={total.actualAmountUzs} />
          </p>
        </div>
        <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Reja</dt>
            <dd className="mt-1 break-words text-base font-semibold text-slate-900">
              <Amount value={total.plannedAmountUzs} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500" title="Farq = reja minus amaldagi xarajat">
              Farq
            </dt>
            <dd
              className={cn(
                'mt-1 break-words text-base font-semibold',
                isOver ? 'text-rose-700' : 'text-slate-900',
              )}
            >
              <Amount value={total.varianceUzs} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500" title="Bajarilish = fakt / reja × 100">
              Bajarilish
            </dt>
            <dd className="mt-1 text-base font-semibold text-slate-900">{completion(total)}</dd>
          </div>
        </dl>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label="Reja"
          value={<Amount value={total.plannedAmountUzs} />}
          helper="Tasdiqlangan oylik xarajat rejasi"
        />
        <MiniMetric
          label="Fakt"
          value={<Amount value={total.actualAmountUzs} />}
          helper="Tanlangan oydagi haqiqiy xarajat"
        />
        <MiniMetric
          label="Farq"
          value={<Amount value={total.varianceUzs} />}
          helper={varianceLabel(total)}
        />
        <MiniMetric label="Bajarilish" value={completion(total)} helper="Fakt / reja × 100" />
      </div>
    </section>
  );
}

type MonthlyFinancial = NonNullable<MonthlyReport['financialMonths']>[number];

function financialBarWidth(value: bigint, max: bigint) {
  if (max === 0n || value === 0n) return 0;
  const absolute = value < 0n ? -value : value;
  return Math.max(2, Number((absolute * 10_000n) / max) / 100);
}

function RevenueProfitBar({ data }: { data: MonthlyFinancial }) {
  const revenuePlan = data.revenuePlanUzs === null ? null : BigInt(data.revenuePlanUzs);
  const revenueActual = BigInt(data.revenueActualUzs);
  const netProfit = BigInt(data.netProfitUzs);
  const absoluteProfit = netProfit < 0n ? -netProfit : netProfit;
  const max = [revenuePlan ?? 0n, revenueActual, absoluteProfit].reduce((largest, value) =>
    value > largest ? value : largest,
  );
  const rows = [
    {
      key: 'plan',
      label: 'Rejadagi tushum',
      value: revenuePlan,
      valueUzs: data.revenuePlanUzs,
      helper: 'Tanlangan oy uchun tushum rejasi',
      bar: 'bg-slate-400',
      valueClass: 'text-slate-950',
    },
    {
      key: 'actual',
      label: 'Amaldagi tushum',
      value: revenueActual,
      valueUzs: data.revenueActualUzs,
      helper:
        data.revenueCompletionPercent === null
          ? 'Tushum rejasi mavjud emas'
          : `Reja bajarilishi ${formatPercent(data.revenueCompletionPercent)}`,
      bar: 'bg-blue-600',
      valueClass: 'text-blue-700',
    },
    {
      key: 'profit',
      label: netProfit < 0n ? 'Sof zarar' : 'Sof foyda',
      value: netProfit,
      valueUzs: data.netProfitUzs,
      helper:
        data.netMarginPercent === null
          ? 'Marja hisoblanmaydi'
          : `Sof foyda marjasi ${formatPercent(data.netMarginPercent)}`,
      bar: netProfit < 0n ? 'bg-rose-500' : 'bg-emerald-500',
      valueClass: netProfit < 0n ? 'text-rose-700' : 'text-emerald-700',
    },
  ];

  return (
    <section aria-label="Tushum va sof foyda" className={cn(surface, 'p-5 sm:p-6')}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Heading
          title="Tushum va sof foyda"
          description="Rejadagi tushum, amaldagi tushum va xarajatlardan keyingi natija"
        />
        <p className="mb-4 text-xs text-slate-500">
          Amaldagi xarajat: <Amount value={data.expenseActualUzs} className="font-semibold" />
        </p>
      </div>
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {row.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{row.helper}</p>
              </div>
              <p className={cn('text-lg font-semibold tabular-nums', row.valueClass)}>
                {row.valueUzs === null ? 'Reja mavjud emas' : <Amount value={row.valueUzs} />}
              </p>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"
              aria-hidden="true"
            >
              <div
                className={cn('h-full rounded-full transition-[width] duration-300', row.bar)}
                style={{ width: `${financialBarWidth(row.value ?? 0n, max)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Sof foyda = amaldagi tushum − amaldagi xarajat.
      </p>
    </section>
  );
}

function ResultGrid({ data }: { data: PlanActual }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-slate-500" title="Tasdiqlangan oylik xarajat rejasi">
          Reja
        </dt>
        <dd className="mt-1 break-words font-semibold text-slate-900">
          <Amount value={data.plannedAmountUzs} />
        </dd>
      </div>
      <div>
        <dt className="text-slate-500" title="Amalda sarflangan summa">
          Fakt
        </dt>
        <dd className="mt-1 break-words font-semibold text-slate-900">
          <Amount value={data.actualAmountUzs} />
        </dd>
      </div>
      <div>
        <dt className="text-slate-500" title="Farq = reja minus amaldagi xarajat">
          Farq
        </dt>
        <dd className="mt-1 break-words font-semibold text-slate-900">
          <Amount value={data.varianceUzs} />
        </dd>
      </div>
      <div>
        <dt className="text-slate-500" title="Bajarilish = fakt / reja × 100">
          Bajarilish
        </dt>
        <dd className="mt-1 font-semibold text-slate-900">{completion(data)}</dd>
      </div>
    </dl>
  );
}

function Composition({ summary }: { summary: MonthlyExecutiveSummary }) {
  return (
    <section aria-label="Xarajat tarkibi">
      <Heading title="Xarajat tarkibi" description="Doimiy va o‘zgaruvchan xarajatlar reja-fakti" />
      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            { title: 'Doimiy xarajatlar', data: summary.fixed, share: summary.fixedSharePct },
            {
              title: 'O‘zgaruvchan xarajatlar',
              data: summary.variable,
              share: summary.variableSharePct,
            },
          ] as const
        ).map((item) => (
          <article key={item.title} className={cn(surface, 'min-w-0 p-5 sm:p-6')}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
              <div>
                <h3 className="font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950">
                  <Amount value={item.data.actualAmountUzs} />
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                Jami ulushi {formatPercent(item.share)}
              </span>
            </div>
            <div className="pt-5">
              <ResultGrid data={item.data} />
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500">
        Jami fakt:{' '}
        <span className="font-semibold text-slate-800">
          <Amount value={summary.overall.actualAmountUzs} />
        </span>
      </p>
    </section>
  );
}

function Branches({ comparison }: { comparison: BranchComparisonReport }) {
  const branches = comparison.selectedMonth.branches;
  return (
    <section aria-label="Filiallar bo‘yicha reja-fakt">
      <Heading title="Filiallar" description="Tanlangan oy va ruxsat etilgan filiallar kesimi" />
      {branches.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {branches.map((item) => (
            <article key={item.branch.id} className={cn(surface, 'min-w-0 p-5 sm:p-6')}>
              <h3 className="mb-5 text-lg font-semibold text-slate-950">{item.branch.name}</h3>
              <ResultGrid data={item.expense} />
              <p className="mt-5 text-xs font-medium text-slate-600">
                {varianceLabel(item.expense)}
              </p>
            </article>
          ))}
          {branches.length > 1 ? (
            <article
              className={cn(
                surface,
                'min-w-0 border-slate-300 bg-slate-50/70 p-5 sm:p-6 lg:col-span-2',
              )}
            >
              <h3 className="mb-5 text-lg font-semibold text-slate-950">Barcha filiallar jami</h3>
              <ResultGrid data={comparison.selectedMonth.total.expense} />
            </article>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Filial ma’lumoti mavjud emas.</p>
      )}
    </section>
  );
}

function Trend({
  comparison,
  selectedMonth,
}: {
  comparison: BranchComparisonReport;
  selectedMonth: number;
}) {
  const rows = comparison.months.map((item) => ({
    name: shortMonths[item.month - 1] ?? String(item.month),
    month: item.month,
    plan: item.total.expense.plannedAmountUzs,
    actual: item.total.expense.actualAmountUzs,
  }));
  const safe = rows.every((row) =>
    [row.plan, row.actual].every(
      (amount) => amount === null || BigInt(amount) <= BigInt(Number.MAX_SAFE_INTEGER),
    ),
  );
  return (
    <section aria-label="Yillik reja va fakt trendi" className={cn(surface, 'min-w-0 p-5 sm:p-6')}>
      <Heading
        title="Reja va fakt"
        description={`${comparison.year} yil oylar bo‘yicha · tanlangan filial scope’i`}
      />
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#b9c5d7]" />
          Reja
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
          Fakt
        </span>
      </div>
      {/* The chart gives the shape, the tiles the exact figures; from xl up they
          share a row. Halves at xl so a tile still holds "198 726 000 so‘m"
          with the sidebar open; the chart takes more of the row at 2xl. */}
      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {safe ? (
          <div
            role="img"
            aria-label="Oylar bo‘yicha reja va fakt ustunli diagrammasi"
            className="relative h-60 min-w-0 xl:h-auto xl:min-h-56"
          >
            {/* Absolute, so the measured SVG never feeds back into the row
                height it is stretched to. */}
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows.map((row) => ({
                    ...row,
                    planValue: row.plan === null ? null : toChartNumber(row.plan),
                    actualValue: toChartNumber(row.actual),
                  }))}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="#e9eef5" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    // A no-break space: recharts wraps a tick at an ordinary
                    // one, which split "200 mln" over two lines.
                    tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}\u00a0mln`}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value) => formatMoney(String(value))}
                    labelFormatter={(label) => `${label} ${comparison.year}`}
                  />
                  <Bar
                    dataKey="planValue"
                    name="Reja"
                    fill="#b9c5d7"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                  />
                  <Bar
                    dataKey="actualValue"
                    name="Fakt"
                    fill="#2563eb"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Summalar diagramma diapazonidan katta. To‘liq qiymatlar yonida ko‘rsatilgan.
          </p>
        )}
        <ul
          aria-label="Oylar bo‘yicha reja va fakt"
          className="grid grid-cols-2 content-start gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3"
        >
          {rows.map((row) => (
            <li
              key={row.month}
              aria-current={row.month === selectedMonth ? 'true' : undefined}
              className={cn(
                'min-w-0 rounded-lg px-2.5 py-1.5 text-[11px] leading-4',
                row.month === selectedMonth
                  ? 'bg-blue-50 text-blue-900 ring-1 ring-blue-100'
                  : 'bg-slate-50 text-slate-600',
              )}
            >
              <p className="font-semibold">{monthNameUz(row.month)}</p>
              <TrendFigure label="Reja" swatch="bg-[#b9c5d7]" value={row.plan} />
              <TrendFigure label="Fakt" swatch="bg-blue-600" value={row.actual} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A tile line: the chart's colour stands in for the word, which stays for screen readers. */
function TrendFigure({
  label,
  swatch,
  value,
}: {
  label: string;
  swatch: string;
  value: string | null;
}) {
  const muted = value === null || BigInt(value) === 0n;
  return (
    <p
      className={cn('mt-0.5 flex items-center gap-1.5 tabular-nums', muted && 'opacity-60')}
      title={value === null ? `${label} mavjud emas` : `${label}: ${formatMoney(value)}`}
    >
      <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-sm', swatch)} />
      <span className="sr-only">{label}: </span>
      <span className="truncate">{value === null ? '—' : formatMoney(value)}</span>
    </p>
  );
}

type Category = MonthlyExecutiveSummary['categories'][number];

function CategoryTable({ categories }: { categories: Category[] }) {
  if (!categories.length)
    return <p className="text-sm text-slate-500">Bu oy uchun kategoriya ma’lumoti mavjud emas.</p>;
  return (
    <>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 md:hidden">
        {categories.map((item) => (
          <li key={item.id} className="px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words text-sm font-semibold text-slate-900">
                {item.name} <TypeBadge type={item.type} />
              </p>
              <CompletionCell data={item.planActual} />
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Reja <Figure value={item.planActual.plannedAmountUzs} /> · fakt{' '}
              <Figure value={item.planActual.actualAmountUzs} /> · farq{' '}
              <VarianceFigure value={item.planActual.varianceUzs} />
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden max-h-[30rem] overflow-auto rounded-xl border border-slate-100 md:block">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Kategoriya</th>
              <th className="px-3 py-2 text-right" title="Tasdiqlangan oylik xarajat rejasi">
                Reja
              </th>
              <th className="px-3 py-2 text-right" title="Amalda sarflangan summa">
                Fakt
              </th>
              <th className="px-3 py-2 text-right" title="Farq = reja minus amaldagi xarajat">
                Farq
              </th>
              <th className="px-3 py-2 text-right" title="Bajarilish = fakt / reja × 100">
                Bajarilish
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <th scope="row" className="px-3 py-1.5 text-left font-medium text-slate-900">
                  {item.name} <TypeBadge type={item.type} />
                </th>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <Figure value={item.planActual.plannedAmountUzs} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold">
                  <Figure value={item.planActual.actualAmountUzs} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <VarianceFigure value={item.planActual.varianceUzs} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <CompletionCell data={item.planActual} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** "Turi" as a tag on the name rather than a column of its own. */
function TypeBadge({ type }: { type: Category['type'] }) {
  return (
    <span
      className={cn(
        'ml-1 inline-block rounded px-1.5 py-px align-middle text-[10px] font-medium',
        type === 'fixed' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700',
      )}
    >
      {type === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
    </span>
  );
}

/** A zero recedes so the categories that moved stand out. */
function Figure({ value }: { value: string | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  return <Amount value={value} className={BigInt(value) === 0n ? 'text-slate-400' : ''} />;
}

/** Expense variance: positive is under the plan (saved), negative is over it. */
function VarianceFigure({ value }: { value: string | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const amount = BigInt(value);
  return (
    <Amount
      value={value}
      className={
        amount > 0n ? 'text-emerald-700' : amount < 0n ? 'text-rose-700' : 'text-slate-400'
      }
    />
  );
}

function CompletionCell({ data }: { data: PlanActual }) {
  const percent = data.completionPercent;
  if (percent === null)
    return (
      <span className="text-[11px] text-slate-400" title={varianceLabel(data)}>
        —
      </span>
    );
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span
        aria-hidden="true"
        className="hidden h-1 w-12 overflow-hidden rounded-full bg-slate-100 lg:block"
      >
        <span
          className={cn('block h-full rounded-full', percent > 100 ? 'bg-rose-500' : 'bg-blue-500')}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </span>
      <PercentText
        value={percent}
        className={cn('font-semibold', percent > 100 ? 'text-rose-700' : 'text-slate-700')}
      />
    </span>
  );
}

function Exceptions({ categories }: { categories: Category[] }) {
  const overspent = categories.filter(
    (item) => item.planActual.status === 'over_plan' || item.planActual.status === 'unplanned',
  );
  const savings = categories.filter(
    (item) =>
      item.planActual.hasPlan &&
      item.planActual.varianceUzs !== null &&
      BigInt(item.planActual.varianceUzs) > 0n,
  );
  return (
    // items-start: an empty list should not stretch to the height of a full one.
    <section aria-label="Rejadan og‘ishlar" className="grid items-start gap-4 lg:grid-cols-2">
      {(
        [
          {
            title: 'Rejadan oshgan xarajatlar',
            rows: overspent,
            empty: 'Bu oyda reja oshgan xarajatlar aniqlanmadi.',
            tone: 'rose',
          },
          {
            title: 'Tejalgan xarajatlar',
            rows: savings,
            empty: 'Bu oyda reja-fakt tejash natijasi aniqlanmadi.',
            tone: 'emerald',
          },
        ] as const
      ).map((group) => (
        <section
          key={group.title}
          aria-label={group.title}
          className={cn(surface, 'min-w-0 p-4 sm:p-5')}
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">{group.title}</h2>
            {group.rows.length ? (
              <span className="text-xs font-medium text-slate-500">{group.rows.length} ta</span>
            ) : null}
          </div>
          {group.rows.length ? (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
              {group.rows.map((item) => (
                <DeviationRow
                  key={item.id}
                  data={item.planActual}
                  name={item.name}
                  tone={group.tone}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{group.empty}</p>
          )}
        </section>
      ))}
    </section>
  );
}

/**
 * One category on one line: what it is and what was planned against spent on
 * the left, the gap on the right, and a bar for how far the plan was used.
 * The group heading already says over or under, so the row does not repeat it.
 */
function DeviationRow({
  name,
  data,
  tone,
}: {
  name: string;
  data: PlanActual;
  tone: 'rose' | 'emerald';
}) {
  const percent = data.completionPercent;
  return (
    <li className="bg-slate-50/50 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-slate-900 sm:truncate">{name}</p>
          <p className="text-[11px] text-slate-500 sm:truncate">
            Reja {data.plannedAmountUzs === null ? 'yo‘q' : formatMoney(data.plannedAmountUzs)} ·
            fakt {formatMoney(data.actualAmountUzs)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              'text-sm font-semibold tabular-nums',
              tone === 'rose' ? 'text-rose-700' : 'text-emerald-700',
            )}
          >
            {data.varianceUzs === null ? (
              <Amount value={data.actualAmountUzs} />
            ) : (
              <Amount value={data.varianceUzs} />
            )}
          </p>
          <p className="text-[11px] font-medium text-slate-500">
            {percent === null
              ? varianceLabel(data)
              : `${tone === 'rose' ? 'Oshish' : 'Tejash'} ${formatPercent(Math.abs(percent - 100))}`}
          </p>
        </div>
      </div>
      {percent !== null ? (
        <div
          role="img"
          aria-label={`Bajarilish ${formatPercent(percent)}`}
          title={`Bajarilish ${formatPercent(percent)}`}
          className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200/70"
        >
          {/* Filled share = what was spent of the plan; the grey rest is what was saved. */}
          <div
            className={cn('h-full rounded-full', tone === 'rose' ? 'bg-rose-500' : 'bg-blue-500')}
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        </div>
      ) : null}
    </li>
  );
}

function TopExpenses({ categories }: { categories: Category[] }) {
  const top = categories.filter((item) => BigInt(item.planActual.actualAmountUzs) > 0n).slice(0, 5);
  return (
    <section aria-label="Eng katta xarajatlar" className={cn(surface, 'p-5 sm:p-6')}>
      <Heading
        title="Eng katta xarajatlar"
        description="Fakt summasi bo‘yicha eng yirik besh kategoriya"
      />
      {top.length ? (
        <ol className="space-y-4">
          {top.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {index + 1}. {item.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.type === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                </p>
              </div>
              <div className="text-right">
                <p className="break-words font-semibold text-slate-950">
                  <Amount value={item.planActual.actualAmountUzs} />
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Jami ulushi {formatPercent(item.sharePct)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-500">Tanlangan oyda xarajat mavjud emas.</p>
      )}
    </section>
  );
}

export function MonthlyReportDashboard({
  report,
  comparison,
  month,
}: {
  report: MonthlyReport;
  comparison: BranchComparisonReport;
  month: number;
}) {
  const summary = buildMonthlyExecutiveSummary(report, month);
  if (comparison.selectedMonth.month !== month || comparison.year !== report.year)
    return (
      <EmptyState
        title="Hisobot davrlari mos kelmadi"
        description="Oylik va filiallar ma’lumotlari bir xil davr uchun olinmadi."
      />
    );
  const active = summary.categories.filter(
    (item) =>
      item.planActual.hasPlan ||
      BigInt(item.planActual.actualAmountUzs) !== 0n ||
      item.transactionCount > 0,
  );
  const financial = report.financialMonths?.find((item) => item.month === month);
  const hasFinancialData =
    financial !== undefined &&
    (financial.revenuePlanUzs !== null ||
      BigInt(financial.revenueActualUzs) !== 0n ||
      BigInt(financial.expenseActualUzs) !== 0n);
  if (!active.length && !hasFinancialData)
    return (
      <EmptyState
        title="Bu oy uchun ma’lumot mavjud emas"
        description="Tanlangan davr va filialda reja ham, xarajat ham qayd etilmagan."
      />
    );
  const branchTotal = comparison.selectedMonth.total.expense;
  if (
    BigInt(branchTotal.actualAmountUzs) !== BigInt(summary.overall.actualAmountUzs) ||
    BigInt(branchTotal.plannedAmountUzs ?? '0') !== BigInt(summary.overall.plannedAmountUzs ?? '0')
  )
    return (
      <EmptyState
        title="Hisobot manbalari mos kelmadi"
        description="Kategoriya va filial jami bir xil emas. Moliyaviy natijani ko‘rsatishdan oldin server ma’lumotlarini tekshiring."
      />
    );
  return (
    <div className="min-w-0 space-y-8 pb-8">
      <Overview summary={summary} year={report.year} />
      {financial ? <RevenueProfitBar data={financial} /> : null}
      <Composition summary={summary} />
      <Branches comparison={comparison} />
      <Trend comparison={comparison} selectedMonth={month} />
      <Exceptions categories={active} />
      <TopExpenses categories={active} />
      <section
        aria-label="Kategoriyalar bo‘yicha batafsil hisobot"
        className={cn(surface, 'overflow-hidden p-4 sm:p-5')}
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Xarajatlar kategoriyalar bo‘yicha
            </h2>
            <p className="text-xs text-slate-500">
              Tanlangan oydagi reja, fakt, farq va bajarilish
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">{active.length} ta kategoriya</span>
        </div>
        <CategoryTable categories={active} />
      </section>
    </div>
  );
}

export function MonthlyReportSkeleton() {
  return (
    <div role="status" aria-label="Oylik hisobot yuklanmoqda" className="animate-pulse space-y-5">
      <span className="sr-only">Oylik hisobot yuklanmoqda…</span>
      <div className="h-72 rounded-[1.5rem] bg-slate-200/70" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 rounded-[1.5rem] bg-slate-200/70" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-52 rounded-[1.5rem] bg-slate-200/70" />
        <div className="h-52 rounded-[1.5rem] bg-slate-200/70" />
      </div>
    </div>
  );
}
