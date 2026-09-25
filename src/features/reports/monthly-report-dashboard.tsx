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
    <article className={cn(surface, 'min-w-0 p-5 sm:p-6')}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-4 break-words text-[clamp(1.45rem,2vw,2rem)] font-semibold leading-tight tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-3 text-sm text-slate-600">{helper}</p>
    </article>
  );
}

function Overview({ summary, year }: { summary: MonthlyExecutiveSummary; year: number }) {
  const total = summary.overall;
  const isOver = total.varianceUzs !== null && BigInt(total.varianceUzs) < 0n;
  return (
    <section aria-label="Oylik moliyaviy natija" className="space-y-4">
      <div className={cn(surface, 'overflow-hidden px-6 py-7 sm:px-8 sm:py-9')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">
              {summary.monthLabel} {year}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
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
        <div className="mt-8">
          <p className="text-sm text-slate-500">Amaldagi xarajat</p>
          <p className="mt-2 break-words text-[clamp(2.2rem,5vw,4.25rem)] font-semibold leading-[1.1] tracking-[-0.045em] text-slate-950">
            <Amount value={total.actualAmountUzs} />
          </p>
        </div>
        <dl className="mt-8 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-500">Reja</dt>
            <dd className="mt-1 break-words text-lg font-semibold text-slate-900">
              <Amount value={total.plannedAmountUzs} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500" title="Farq = reja minus amaldagi xarajat">
              Farq
            </dt>
            <dd
              className={cn(
                'mt-1 break-words text-lg font-semibold',
                isOver ? 'text-rose-700' : 'text-slate-900',
              )}
            >
              <Amount value={total.varianceUzs} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500" title="Bajarilish = fakt / reja × 100">
              Bajarilish
            </dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{completion(total)}</dd>
          </div>
        </dl>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      {safe ? (
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
      ) : null}
      {safe ? (
        <div
          role="img"
          aria-label="Oylar bo‘yicha reja va fakt ustunli diagrammasi"
          className="h-72 min-w-0 sm:h-80"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows.map((row) => ({
                ...row,
                planValue: row.plan === null ? null : toChartNumber(row.plan),
                actualValue: toChartNumber(row.actual),
              }))}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#e9eef5" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => `${Math.round(value / 1_000_000)} mln`}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={58}
              />
              <Tooltip
                formatter={(value) => formatMoney(String(value))}
                labelFormatter={(label) => `${label} ${comparison.year}`}
              />
              <Bar
                dataKey="planValue"
                name="Reja"
                fill="#b9c5d7"
                radius={[4, 4, 0, 0]}
                maxBarSize={17}
              />
              <Bar
                dataKey="actualValue"
                name="Fakt"
                fill="#2563eb"
                radius={[4, 4, 0, 0]}
                maxBarSize={17}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Summalar diagramma diapazonidan katta. To‘liq qiymatlar pastda ko‘rsatilgan.
        </p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.month}
            className={cn(
              'rounded-xl px-3 py-2 text-xs',
              row.month === selectedMonth
                ? 'bg-blue-50 text-blue-900'
                : 'bg-slate-50 text-slate-600',
            )}
          >
            <p className="font-semibold">{monthNameUz(row.month)}</p>
            <p className="mt-1">Reja: {formatMoney(row.plan)}</p>
            <p>Fakt: {formatMoney(row.actual)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

type Category = MonthlyExecutiveSummary['categories'][number];

function CategoryTable({ categories }: { categories: Category[] }) {
  if (!categories.length)
    return <p className="text-sm text-slate-500">Bu oy uchun kategoriya ma’lumoti mavjud emas.</p>;
  return (
    <>
      <div className="space-y-3 md:hidden">
        {categories.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-950">{item.name}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {item.type === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
            </p>
            <div className="mt-4">
              <ResultGrid data={item.planActual} />
            </div>
            <p className="mt-3 text-xs text-slate-500">{varianceLabel(item.planActual)}</p>
          </article>
        ))}
      </div>
      <div className="hidden max-h-[35rem] overflow-auto md:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Kategoriya</th>
              <th className="px-4 py-3">Turi</th>
              <th className="px-4 py-3 text-right" title="Tasdiqlangan oylik xarajat rejasi">
                Reja
              </th>
              <th className="px-4 py-3 text-right" title="Amalda sarflangan summa">
                Fakt
              </th>
              <th className="px-4 py-3 text-right" title="Farq = reja minus amaldagi xarajat">
                Farq
              </th>
              <th className="px-4 py-3 text-right" title="Bajarilish = fakt / reja × 100">
                Bajarilish
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <th scope="row" className="px-4 py-4 text-left font-medium text-slate-900">
                  {item.name}
                </th>
                <td className="px-4 py-4 text-slate-600">
                  {item.type === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right">
                  <Amount value={item.planActual.plannedAmountUzs} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold">
                  <Amount value={item.planActual.actualAmountUzs} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right">
                  <Amount value={item.planActual.varianceUzs} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right">
                  {completion(item.planActual)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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
    <section aria-label="Rejadan og‘ishlar" className="grid gap-4 lg:grid-cols-2">
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
        <section key={group.title} className={cn(surface, 'min-w-0 p-5 sm:p-6')}>
          <Heading title={group.title} />
          {group.rows.length ? (
            <ul className="space-y-3">
              {group.rows.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {varianceLabel(item.planActual)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        'break-words font-semibold',
                        group.tone === 'rose' ? 'text-rose-700' : 'text-emerald-700',
                      )}
                    >
                      {item.planActual.varianceUzs === null ? (
                        'Reja mavjud emas'
                      ) : (
                        <Amount value={item.planActual.varianceUzs} />
                      )}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Reja {formatMoney(item.planActual.plannedAmountUzs)} · fakt{' '}
                    {formatMoney(item.planActual.actualAmountUzs)} · bajarilish{' '}
                    {formatPercent(item.planActual.completionPercent)}
                  </p>
                  {item.planActual.completionPercent !== null ? (
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      {group.tone === 'rose' ? 'Oshish' : 'Tejash'}{' '}
                      {formatPercent(Math.abs(item.planActual.completionPercent - 100))}
                    </p>
                  ) : null}
                </li>
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
  if (!active.length)
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
      <Composition summary={summary} />
      <Branches comparison={comparison} />
      <Trend comparison={comparison} selectedMonth={month} />
      <Exceptions categories={active} />
      <TopExpenses categories={active} />
      <section
        aria-label="Kategoriyalar bo‘yicha batafsil hisobot"
        className={cn(surface, 'overflow-hidden p-5 sm:p-6')}
      >
        <Heading
          title="Xarajatlar kategoriyalar bo‘yicha"
          description="Tanlangan oydagi reja, fakt, farq va bajarilish"
        />
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
