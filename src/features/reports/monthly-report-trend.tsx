import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/shared/lib/cn';
import { MONTH_SHORT_NAMES_UZ, formatMoney, monthNameUz, toChartNumber } from '@/shared/lib/format';
import type { BranchComparisonReport } from '@/shared/types/domain';
import { surface } from './monthly-report-format';
import { Heading } from './monthly-report-ui';

export function Trend({
  comparison,
  selectedMonth,
}: {
  comparison: BranchComparisonReport;
  selectedMonth: number;
}) {
  const rows = comparison.months.map((item) => ({
    name: MONTH_SHORT_NAMES_UZ[item.month - 1] ?? String(item.month),
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
          <span className="h-2.5 w-2.5 rounded-sm bg-sand-300" />
          Reja
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-navy-700" />
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
                  <CartesianGrid
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    // A no-break space: recharts wraps a tick at an ordinary
                    // one, which split "200 mln" over two lines.
                    tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}\u00a0mln`}
                    tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
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
                    fill="var(--chart-plan)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                  />
                  <Bar
                    dataKey="actualValue"
                    name="Fakt"
                    fill="var(--chart-actual)"
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
                  ? 'neu-inset text-blue-900 ring-1 ring-blue-200/70'
                  : 'neu-raised-sm text-slate-600',
              )}
            >
              <p className="font-semibold">{monthNameUz(row.month)}</p>
              <TrendFigure label="Reja" swatch="bg-sand-300" value={row.plan} />
              <TrendFigure label="Fakt" swatch="bg-navy-700" value={row.actual} />
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
