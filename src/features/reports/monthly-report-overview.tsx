import { cn } from '@/shared/lib/cn';
import { formatPercent } from '@/shared/lib/format';
import { ProgressBar } from '@/shared/ui';
import type { MonthlyExecutiveSummary } from './monthly-report';
import {
  financialBarWidth,
  type MonthlyFinancial,
  surface,
  varianceLabel,
} from './monthly-report-format';
import { Amount, Completion, Heading, MiniMetric } from './monthly-report-ui';

export function Overview({ summary, year }: { summary: MonthlyExecutiveSummary; year: number }) {
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
            <dd className="mt-1 text-base font-semibold text-slate-900">
              <Completion data={total} />
            </dd>
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
        <MiniMetric
          label="Bajarilish"
          value={<Completion data={total} />}
          helper="Fakt / reja × 100"
        />
      </div>
    </section>
  );
}

export function RevenueProfitBar({ data }: { data: MonthlyFinancial }) {
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
      bar: 'bg-navy-700',
      valueClass: 'text-navy-700',
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
            <ProgressBar
              value={financialBarWidth(row.value ?? 0n, max)}
              className="mt-2 h-2.5"
              barClassName={cn('transition-[width] duration-300', row.bar)}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Sof foyda = amaldagi tushum − amaldagi xarajat.
      </p>
    </section>
  );
}
