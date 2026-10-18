import { cn } from '@/shared/lib/cn';
import { formatPercent } from '@/shared/lib/format';
import type { BranchComparisonReport } from '@/shared/types/domain';
import type { MonthlyExecutiveSummary } from './monthly-report';
import { Amount, Heading, ResultGrid } from './monthly-report-ui';
import { surface, varianceLabel } from './monthly-report-format';

export function Composition({ summary }: { summary: MonthlyExecutiveSummary }) {
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

export function Branches({ comparison }: { comparison: BranchComparisonReport }) {
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
              className={cn('neu-inset rounded-[1.5rem]', 'min-w-0 p-5 sm:p-6 lg:col-span-2')}
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
