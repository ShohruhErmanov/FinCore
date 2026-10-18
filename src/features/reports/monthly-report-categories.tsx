import { cn } from '@/shared/lib/cn';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import type { PlanActual } from '@/shared/types/domain';
import { ProgressBar } from '@/shared/ui';
import { type Category, surface, varianceLabel } from './monthly-report-format';
import {
  Amount,
  CompletionCell,
  Figure,
  Heading,
  TypeBadge,
  VarianceFigure,
} from './monthly-report-ui';

export function CategoryTable({ categories }: { categories: Category[] }) {
  if (!categories.length)
    return <p className="text-sm text-slate-500">Bu oy uchun kategoriya ma’lumoti mavjud emas.</p>;
  return (
    <>
      <ul className="neu-inset divide-y divide-border/70 overflow-hidden rounded-xl md:hidden">
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
      <div className="hidden neu-inset max-h-[30rem] overflow-auto rounded-xl md:block">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="sticky top-0 z-10 bg-canvas text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
              <tr key={item.id} className="border-t border-border/60 hover:bg-canvas/60">
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

export function Exceptions({ categories }: { categories: Category[] }) {
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
            <ul className="neu-inset divide-y divide-border/70 overflow-hidden rounded-xl">
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
    <li className="px-3 py-2">
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
        // Filled share = what was spent of the plan; the grey rest is what was saved.
        <ProgressBar
          value={percent}
          label={`Bajarilish ${formatPercent(percent)}`}
          title={`Bajarilish ${formatPercent(percent)}`}
          className="mt-1.5 h-1"
          barClassName={tone === 'rose' ? 'bg-rose-500' : 'bg-navy-500'}
        />
      ) : null}
    </li>
  );
}

export function TopExpenses({ categories }: { categories: Category[] }) {
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
