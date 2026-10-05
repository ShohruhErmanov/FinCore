import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { MONTH_NAMES_UZ, formatMoney, formatPercent } from '@/shared/lib/format';
import type { BudgetHistory, BudgetLine, MonthlyReport } from '@/shared/types/domain';
import { summarizeBudget } from './budget-summary';
import { buildMonthlyReportMatrix } from '@/features/reports/monthly-report';

type Summary = ReturnType<typeof summarizeBudget>;
const money = (value: bigint | null) => formatMoney(value === null ? null : value.toString());

function width(value: bigint, max: bigint) {
  return max > 0n ? Number((value * 10_000n) / max) / 100 : 0;
}

/** For a phone, where a full month name would squeeze two 9-digit amounts. */
const MONTH_SHORT_UZ = [
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

function budgetSharePct(branchBudget: bigint | null, totalBudget: bigint | null): number | null {
  if (branchBudget === null || totalBudget === null || totalBudget === 0n) return null;
  return Number((branchBudget * 10_000n + totalBudget / 2n) / totalBudget) / 100;
}

function BudgetSurface({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="budget-surface p-5 sm:p-7">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Progress({
  value,
  label,
  danger = false,
}: {
  value: number | null;
  label: string;
  danger?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`${label}: ${formatPercent(value)}`}
      className="h-2 overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none ${danger ? 'bg-red-500' : 'bg-blue-600'}`}
        style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
      />
    </div>
  );
}

function Status({ summary }: { summary: Summary }) {
  const over = summary.remaining !== null && summary.remaining < 0n;
  const warning = summary.unplanned.length > 0 || summary.exceeded.length > 0;
  const label = over
    ? 'Budjetdan oshgan'
    : warning
      ? 'E’tibor talab qiladi'
      : summary.budget === null
        ? 'Reja kiritilmagan'
        : 'Reja doirasida';
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${over ? 'bg-red-50 text-red-800' : warning ? 'bg-amber-50 text-amber-800' : summary.budget === null ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-800'}`}
    >
      {label}
    </span>
  );
}

function CompactSummaryMetrics({ summary }: { summary: Summary }) {
  const remainingLabel = summary.remaining !== null && summary.remaining < 0n ? 'Oshgan' : 'Qolgan';
  const remaining =
    summary.remaining === null
      ? null
      : summary.remaining < 0n
        ? -summary.remaining
        : summary.remaining;

  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        ['Budjet', money(summary.budget)],
        ['Sarflangan', money(summary.actual)],
        [remainingLabel, money(remaining)],
        ['Bajarilish', formatPercent(summary.percent)],
      ].map(([label, value]) => (
        <div
          key={label}
          className="min-w-0 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200/80"
        >
          <dt className="text-[11px] font-medium text-muted">{label}</dt>
          <dd className="budget-value mt-1 truncate text-sm font-semibold text-ink" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function BudgetOverview({ lines, context }: { lines: BudgetLine[]; context: string }) {
  const data = useMemo(() => {
    const summary = summarizeBudget(lines);
    const grouped = new Map<string, BudgetLine[]>();
    for (const line of lines)
      grouped.set(line.branchId, [...(grouped.get(line.branchId) ?? []), line]);
    const branches = [...grouped.entries()].map(([id, rows]) => ({
      id,
      name: rows[0]!.branchName,
      summary: summarizeBudget(rows),
    }));
    const types = (['fixed', 'variable'] as const)
      .map((type) => {
        const typeLines = lines.filter((line) => line.expenseTypeSnapshot === type);
        return {
          type,
          label: type === 'fixed' ? 'Doimiy xarajatlar' : 'O‘zgaruvchan xarajatlar',
          summary: summarizeBudget(typeLines),
          branches: branches.map((branch) => ({
            id: branch.id,
            name: branch.name,
            summary: summarizeBudget(typeLines.filter((line) => line.branchId === branch.id)),
          })),
        };
      })
      .sort((a, b) =>
        a.summary.actual > b.summary.actual ? -1 : a.summary.actual < b.summary.actual ? 1 : 0,
      );
    return { summary, branches, types };
  }, [lines]);
  const { summary, branches, types } = data;
  const problems = [...summary.exceeded, ...summary.unplanned];
  return (
    <div className="space-y-6">
      <section aria-label="Budjet holati" className="budget-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Budjet holati
          </h2>
          <Status summary={summary} />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(15rem,0.85fr)_minmax(0,1.65fr)]">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/80">
            <p className="text-xs font-medium text-muted">Jami budjet</p>
            <p className="budget-value mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
              {money(summary.budget)}
            </p>
            <p className="mt-1 text-xs text-muted">Saqlangan xarajat rejasi</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200/80">
              <p className="text-[11px] font-medium text-muted">Sarflangan</p>
              <p className="budget-value mt-1 truncate text-base font-semibold text-ink">
                {money(summary.actual)}
              </p>
            </div>
            <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200/80">
              <p className="text-[11px] font-medium text-muted">
                {summary.remaining !== null && summary.remaining < 0n
                  ? 'Budjetdan oshgan'
                  : 'Qolgan'}
              </p>
              <p
                className={`budget-value mt-1 truncate text-base font-semibold ${summary.remaining !== null && summary.remaining < 0n ? 'text-red-700' : 'text-ink'}`}
              >
                {money(
                  summary.remaining === null
                    ? null
                    : summary.remaining < 0n
                      ? -summary.remaining
                      : summary.remaining,
                )}
              </p>
            </div>
            <div className="col-span-2 rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200/80 sm:col-span-1">
              <p className="text-[11px] font-medium text-muted">Bajarilish</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-ink">
                {formatPercent(summary.percent)}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <Progress
            value={summary.percent}
            label="Budjet sarflanishi"
            danger={summary.remaining !== null && summary.remaining < 0n}
          />
        </div>
        {summary.budget === null ? (
          <p className="mt-4 text-sm text-muted">
            Budjet ma’lumotlari mavjud emas. Quyida tanlangan davr uchun reja kiriting.
          </p>
        ) : summary.budget === 0n ? (
          <p className="mt-4 text-sm text-muted">
            Nol reja saqlangan. Nol budjet uchun bajarilish foizi hisoblanmaydi.
          </p>
        ) : null}
        {summary.unplanned.length ? (
          <p className="mt-4 text-sm text-amber-800">
            Sarflangan summaga reja kiritilmagan kategoriyalardagi xarajatlar ham kiradi.
          </p>
        ) : null}
      </section>

      {problems.length ? (
        <section
          aria-label="Budjet ogohlantirishlari"
          className="rounded-3xl bg-amber-50/70 p-5 sm:p-6"
        >
          <h2 className="flex items-center gap-2 text-base font-semibold text-amber-900">
            <AlertTriangle className="h-5 w-5" /> E’tibor talab qiladigan xarajatlar
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950">
            {problems.slice(0, 3).map((line) => (
              <li key={line.id}>
                {line.branchName} · {line.categoryNameSnapshot}:{' '}
                {line.hasPlan
                  ? `${money(BigInt(line.actualAmountUzs) - BigInt(line.plannedAmountUzs!))} rejadan oshgan.`
                  : `${formatMoney(line.actualAmountUzs)} sarflangan, reja kiritilmagan.`}
              </li>
            ))}
          </ul>
          {problems.length > 3 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-amber-900 focus-visible:outline-blue-600">
                Yana {problems.length - 3} ta holat
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-amber-950">
                {problems.slice(3).map((line) => (
                  <li key={line.id}>
                    {line.branchName} · {line.categoryNameSnapshot}:{' '}
                    {line.hasPlan
                      ? `${money(BigInt(line.actualAmountUzs) - BigInt(line.plannedAmountUzs!))} rejadan oshgan.`
                      : `${formatMoney(line.actualAmountUzs)} — reja kiritilmagan.`}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : summary.budget !== null ? (
        <p className="flex items-center gap-2 px-1 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" /> Ko‘rsatilgan qatorlarda rejadan oshish aniqlanmadi.
        </p>
      ) : null}

      <section aria-label="Filiallar bo‘yicha budjet">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Filiallar bo‘yicha budjet</h2>
          <p className="text-xs text-muted">
            {branches.length} ta filial · {context}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {branches.map((item) => (
            <article
              key={item.id}
              aria-label={`${item.name} budjeti`}
              className="budget-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{item.name}</h3>
                <Status summary={item.summary} />
              </div>
              <CompactSummaryMetrics summary={item.summary} />
              <div className="mt-3">
                <Progress
                  value={item.summary.percent}
                  label={`${item.name} bajarilishi`}
                  danger={item.summary.remaining !== null && item.summary.remaining < 0n}
                />
              </div>
            </article>
          ))}
        </div>
        {!branches.length ? (
          <p className="py-6 text-sm text-muted">
            Tanlangan filial uchun budjet qatorlari mavjud emas.
          </p>
        ) : null}
      </section>

      <section aria-label="Xarajat turlari" className="budget-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Xarajat turlari</h2>
        <p className="mt-1 text-xs text-muted">Sarflangan summa bo‘yicha tartiblangan</p>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {types.map((item) => (
            <section
              aria-label={item.label}
              key={item.type}
              className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">{item.label}</h3>
                {item === types[0] && item.summary.actual > 0n ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                    <ArrowUpRight aria-hidden="true" className="h-3 w-3" /> Eng katta
                  </span>
                ) : null}
              </div>
              <CompactSummaryMetrics summary={item.summary} />
              <div className="mt-3 border-t border-slate-200/80 pt-3">
                <p className="text-xs font-semibold text-slate-600">Filiallar kesimi</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {item.branches.map((branch) => {
                    const share = budgetSharePct(branch.summary.budget, item.summary.budget);
                    return (
                      <article
                        key={branch.id}
                        aria-label={`${item.label} — ${branch.name}`}
                        className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-sm font-semibold text-ink">{branch.name}</h4>
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
                            {formatPercent(share)}
                          </span>
                        </div>
                        <dl className="mt-2 grid grid-cols-3 gap-2">
                          <div>
                            <dt className="text-[10px] text-muted">Budjet</dt>
                            <dd className="budget-value mt-0.5 truncate text-xs font-semibold text-ink">
                              {money(branch.summary.budget)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] text-muted">Sarflangan</dt>
                            <dd className="budget-value mt-0.5 truncate text-xs font-semibold text-ink">
                              {money(branch.summary.actual)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] text-muted">Qolgan</dt>
                            <dd className="budget-value mt-0.5 truncate text-xs font-semibold text-ink">
                              {money(branch.summary.remaining)}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export function BudgetTrend({
  history,
  branch,
  month,
  report,
}: {
  history: BudgetHistory;
  branch: string;
  month: number;
  report?: MonthlyReport | undefined;
}) {
  const actualMonths = useMemo(
    () => (report ? buildMonthlyReportMatrix(report).overall.months : null),
    [report],
  );
  // Every month of the year, not just the six before the selected one: a gap
  // where no budget was set is as much a part of the picture as a full month.
  const rows = MONTH_NAMES_UZ.map((name, index) => {
    const number = index + 1;
    const period = history.periods.find((item) => item.month === number);
    const plans = (period?.totalsByBranch ?? []).filter(
      (item) => (branch === 'all' || item.branchId === branch) && item.hasPlan,
    );
    return {
      number,
      name,
      actual: actualMonths ? BigInt(actualMonths[index]!.actualAmountUzs) : null,
      value: plans.length
        ? plans.reduce((sum, item) => sum + BigInt(item.plannedAmountUzs ?? '0'), 0n)
        : null,
    };
  });
  const max = rows.reduce(
    (total, row) => [total, row.value ?? 0n, row.actual ?? 0n].reduce((a, b) => (a > b ? a : b)),
    0n,
  );
  const withActual = actualMonths !== null;
  const columns = withActual
    ? 'grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(8.5rem,0.7fr)]'
    : 'grid-cols-[2.25rem_minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)]';

  return (
    <BudgetSurface title="Budjet dinamikasi">
      <p className="mt-1 text-sm text-muted">{history.year} · barcha oylar</p>
      <div className="mt-4">
        <div
          className={`grid gap-x-3 border-b border-slate-100 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted ${columns}`}
        >
          <span>Oy</span>
          <span>Budjet</span>
          {withActual ? <span>Sarflangan</span> : null}
          {withActual ? <span className="hidden text-right sm:block">Farq</span> : null}
        </div>
        <ul aria-label="Oylar">
          {rows.map(({ number, name, value, actual }) => (
            <li
              key={number}
              aria-current={number === month ? 'true' : undefined}
              className={`grid items-center gap-x-3 rounded-lg px-2 py-1.5 ${columns} ${number === month ? 'bg-blue-50/70' : ''}`}
            >
              <span
                className={`text-sm ${number === month ? 'font-semibold text-ink' : 'text-slate-600'}`}
              >
                <span className="sm:hidden">{MONTH_SHORT_UZ[number - 1]}</span>
                <span className="hidden sm:inline">{name}</span>
              </span>
              <TrendCell
                label="Budjet"
                value={value}
                max={max}
                barClassName={number === month ? 'bg-slate-800' : 'bg-slate-400'}
              />
              {withActual ? (
                <>
                  <TrendCell
                    label="Sarflangan"
                    value={actual}
                    max={max}
                    barClassName="bg-blue-600"
                  />
                  <BudgetVariance budget={value} actual={actual} />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        {report
          ? 'Budjet — amaldagi oylik reja. Farq qancha mablag‘ qolganini yoki budjetdan qancha oshganini ko‘rsatadi. “—” — o‘sha oyga budjet kiritilmagan.'
          : 'Hozir faqat oylik rejalar ko‘rsatilmoqda. Xarajat trendi uchun oylik hisobot ma’lumoti kerak.'}
      </p>
    </BudgetSurface>
  );
}

/** Exact monthly budget variance; never invents a difference without a plan. */
function BudgetVariance({ budget, actual }: { budget: bigint | null; actual: bigint | null }) {
  if (budget === null || actual === null)
    return (
      <div className="col-span-2 text-right text-xs font-medium text-slate-400 sm:col-auto sm:col-span-1">
        <span className="sr-only">Farq: </span>—
      </div>
    );

  const variance = actual - budget;
  const isOver = variance > 0n;
  const isRemaining = variance < 0n;
  const amount = isOver ? variance : -variance;
  const label = isOver ? 'oshdi' : isRemaining ? 'qoldi' : 'budjetga teng';
  const description = isOver
    ? `Budjetdan ${money(amount)} oshdi`
    : isRemaining
      ? `Budjetgacha ${money(amount)} qoldi`
      : 'Sarflangan summa budjetga teng';

  return (
    <div
      className={`col-span-2 flex items-center justify-end gap-1.5 text-right text-xs font-semibold tabular-nums sm:col-auto sm:col-span-1 ${isOver ? 'text-red-700' : isRemaining ? 'text-emerald-700' : 'text-slate-600'}`}
      aria-label={`Farq: ${description}`}
      title={description}
    >
      <span aria-hidden="true">{isOver ? '↑' : isRemaining ? '↓' : '•'}</span>
      <span>{isOver || isRemaining ? `${money(amount)} ${label}` : label}</span>
    </div>
  );
}

/** One figure and its bar, sized against the largest figure of the year. */
function TrendCell({
  label,
  value,
  max,
  barClassName,
}: {
  label: string;
  value: bigint | null;
  max: bigint;
  barClassName: string;
}) {
  return (
    <div className="min-w-0">
      <span className="sr-only">{label}: </span>
      <span
        className={`budget-value block truncate text-right text-xs font-semibold tabular-nums sm:text-[13px] ${value === null || value === 0n ? 'text-slate-400' : 'text-ink'}`}
        title={value === null ? 'Budjet kiritilmagan' : money(value)}
      >
        {value === null ? '—' : money(value)}
      </span>
      <div aria-hidden="true" className="mt-1 h-1 rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${width(value ?? 0n, max)}%` }}
        />
      </div>
    </div>
  );
}

export function BudgetSkeleton() {
  return (
    <div role="status" aria-label="Budjet yuklanmoqda" className="space-y-6">
      <span className="sr-only">Budjet yuklanmoqda…</span>
      <div className="budget-surface h-80 p-8">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        <div className="mt-8 h-14 w-3/4 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
        <div className="mt-10 grid grid-cols-3 gap-5">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-16 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((key) => (
          <div key={key} className="budget-surface h-52 animate-pulse motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
