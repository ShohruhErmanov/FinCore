import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import type { PlanActual } from '@/shared/types/domain';
import { MoneyText, PercentText, ProgressBar } from '@/shared/ui';
import { type Category, surface, varianceLabel } from './monthly-report-format';

export function Completion({ data }: { data: PlanActual }) {
  return data.completionPercent === null ? (
    'Reja mavjud emas'
  ) : (
    <PercentText value={data.completionPercent} />
  );
}

export function Amount({ value, className }: { value: string | null; className?: string }) {
  return <MoneyText value={value} className={cn('break-words', className)} />;
}

export function Heading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

export function MiniMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: ReactNode;
  helper: string;
}) {
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

export function ResultGrid({ data }: { data: PlanActual }) {
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
        <dd className="mt-1 font-semibold text-slate-900">
          <Completion data={data} />
        </dd>
      </div>
    </dl>
  );
}

/** "Turi" as a tag on the name rather than a column of its own. */
export function TypeBadge({ type }: { type: Category['type'] }) {
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
export function Figure({ value }: { value: string | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  return <Amount value={value} className={BigInt(value) === 0n ? 'text-slate-400' : ''} />;
}

/** Expense variance: positive is under the plan (saved), negative is over it. */
export function VarianceFigure({ value }: { value: string | null }) {
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

export function CompletionCell({ data }: { data: PlanActual }) {
  const percent = data.completionPercent;
  if (percent === null)
    return (
      <span className="text-[11px] text-slate-400" title={varianceLabel(data)}>
        —
      </span>
    );
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <ProgressBar
        value={percent}
        className="hidden h-1 w-12 lg:block"
        barClassName={percent > 100 ? 'bg-rose-500' : 'bg-navy-500'}
      />
      <PercentText
        value={percent}
        className={cn('font-semibold', percent > 100 ? 'text-rose-700' : 'text-slate-700')}
      />
    </span>
  );
}
