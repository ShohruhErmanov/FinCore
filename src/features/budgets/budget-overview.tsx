import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import type { BudgetHistory, BudgetLine, MonthlyReport } from '@/shared/types/domain';
import { summarizeBudget } from './budget-summary';
import { buildMonthlyReportMatrix } from '@/features/reports/monthly-report';

type Summary = ReturnType<typeof summarizeBudget>;
const money = (value: bigint | null) => formatMoney(value === null ? null : value.toString());

function width(value: bigint, max: bigint) {
  return max > 0n ? Number((value * 10_000n) / max) / 100 : 0;
}

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

function Metrics({ summary }: { summary: Summary }) {
  return (
    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
      {[
        ['Budjet', money(summary.budget)],
        ['Sarflangan', money(summary.actual)],
        [
          summary.remaining !== null && summary.remaining < 0n ? 'Oshgan summa' : 'Qolgan',
          money(
            summary.remaining === null
              ? null
              : summary.remaining < 0n
                ? -summary.remaining
                : summary.remaining,
          ),
        ],
        ['Bajarilish', formatPercent(summary.percent)],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="budget-value mt-1 text-base font-semibold text-ink sm:text-lg">{value}</dd>
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
      <section aria-label="Budjet holati" className="budget-surface p-6 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Budjet holati
          </h2>
          <Status summary={summary} />
        </div>
        <p className="mt-6 text-sm text-slate-600">Jami budjet</p>
        <p className="budget-value mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl lg:text-[3.5rem]">
          {money(summary.budget)}
        </p>
        <p className="mt-3 text-sm text-muted">Saqlangan xarajat rejasi</p>
        <div className="mt-6 grid grid-cols-2 gap-5 sm:mt-8 sm:grid-cols-3 sm:gap-6">
          <div>
            <p className="text-sm text-muted">Sarflangan</p>
            <p className="budget-value mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {money(summary.actual)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">
              {summary.remaining !== null && summary.remaining < 0n ? 'Budjetdan oshgan' : 'Qolgan'}
            </p>
            <p
              className={`budget-value mt-2 text-xl font-semibold tracking-tight sm:text-2xl ${summary.remaining !== null && summary.remaining < 0n ? 'text-red-700' : 'text-ink'}`}
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
          <div>
            <p className="text-sm text-muted">Bajarilish</p>
            <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
              {formatPercent(summary.percent)}
            </p>
          </div>
        </div>
        <div className="mt-7">
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
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Filiallar bo‘yicha budjet</h2>
          <p className="text-sm text-muted">
            {branches.length} ta filial · {context}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {branches.map((item) => (
            <article
              key={item.id}
              aria-label={`${item.name} budjeti`}
              className="budget-surface p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{item.name}</h3>
                <Status summary={item.summary} />
              </div>
              <Metrics summary={item.summary} />
              <div className="mt-6">
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

      <BudgetSurface title="Xarajat turlari">
        <p className="mt-2 text-sm text-muted">Sarflangan summa bo‘yicha tartiblangan</p>
        <div className="mt-5 divide-y divide-slate-100">
          {types.map((item) => (
            <section aria-label={item.label} key={item.type} className="py-5 first:pt-0 last:pb-0">
              <h3 className="flex items-center justify-between text-base font-semibold">
                {item.label}
                {item === types[0] && item.summary.actual > 0n ? (
                  <ArrowUpRight
                    aria-label="Eng katta xarajat turi"
                    className="h-4 w-4 text-blue-600"
                  />
                ) : null}
              </h3>
              <Metrics summary={item.summary} />
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="text-sm font-semibold text-slate-700">Filiallar kesimi</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {item.branches.map((branch) => {
                    const share = budgetSharePct(branch.summary.budget, item.summary.budget);
                    return (
                      <article
                        key={branch.id}
                        aria-label={`${item.label} — ${branch.name}`}
                        className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                      >
                        <h4 className="font-semibold text-ink">{branch.name}</h4>
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                          <div>
                            <dt className="text-muted">Ajratilgan budjet</dt>
                            <dd className="budget-value mt-1 font-semibold text-ink">
                              {money(branch.summary.budget)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Tur budjetidagi ulushi</dt>
                            <dd className="mt-1 font-semibold tabular-nums text-ink">
                              {formatPercent(share)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Sarflangan</dt>
                            <dd className="budget-value mt-1 font-semibold text-ink">
                              {money(branch.summary.actual)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Qolgan</dt>
                            <dd className="budget-value mt-1 font-semibold text-ink">
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
      </BudgetSurface>
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
  const rows = history.periods
    .filter((period) => period.month <= month)
    .slice(-6)
    .map((period) => {
      const plans = period.totalsByBranch.filter(
        (item) => (branch === 'all' || item.branchId === branch) && item.hasPlan,
      );
      return {
        period,
        actual: actualMonths ? BigInt(actualMonths[period.month - 1]!.actualAmountUzs) : null,
        value: plans.length
          ? plans.reduce((sum, item) => sum + BigInt(item.plannedAmountUzs ?? '0'), 0n)
          : null,
      };
    });
  const max = rows.reduce(
    (total, row) => [total, row.value ?? 0n, row.actual ?? 0n].reduce((a, b) => (a > b ? a : b)),
    0n,
  );
  return (
    <BudgetSurface title="Budjet dinamikasi">
      <p className="mt-2 text-sm text-muted">
        {history.year} · Tanlangan oygacha oxirgi olti hisob oyi
      </p>
      <div className="mt-6 space-y-4">
        {rows.map(({ period, value, actual }) => (
          <div
            key={period.periodId}
            className={`grid gap-2 rounded-xl p-3 sm:grid-cols-[8rem_1fr] sm:items-center ${period.month === month ? 'bg-blue-50/60' : ''}`}
          >
            <span className="text-sm font-medium">{period.periodLabel}</span>
            <div>
              <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-muted">Budjet</span>
                <span className="budget-value font-semibold">{money(value)}</span>
              </div>
              <div aria-hidden="true" className="h-1.5 rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${period.month === month ? 'bg-slate-800' : 'bg-slate-400'}`}
                  style={{ width: `${width(value ?? 0n, max)}%` }}
                />
              </div>
              {actual !== null ? (
                <>
                  <div className="mb-2 mt-3 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="text-muted">Sarflangan</span>
                    <span className="budget-value font-semibold">{money(actual)}</span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${width(actual, max)}%` }}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">
        {report
          ? 'Budjet — amaldagi oylik reja. Sarflangan — oylik hisobotdagi haqiqiy xarajatlar.'
          : 'Hozir faqat oylik rejalar ko‘rsatilmoqda. Xarajat trendi uchun oylik hisobot ma’lumoti kerak.'}
      </p>
    </BudgetSurface>
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
