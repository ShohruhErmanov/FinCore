import { useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_TOOLTIP_STYLE } from '@/shared/lib/chart-theme';
import { formatMoney, formatPercent, toChartNumber } from '@/shared/lib/format';
import type { AnnualExpenseSummary } from '@/shared/types/domain';
import { Card } from '@/shared/ui';
import { axisMoney } from './dashboard-format';

export function AnnualCompositionCharts({ data }: { data: AnnualExpenseSummary }) {
  const [activeCompositionIndex, setActiveCompositionIndex] = useState<number | null>(null);
  const monthly = data.months.map((row) => ({
    label: row.label,
    fixed: toChartNumber(row.fixedUzs),
    variable: toChartNumber(row.variableUzs),
  }));
  const composition = [
    {
      name: 'Doimiy',
      value: toChartNumber(data.fixedActualUzs),
      color: 'var(--chart-actual)',
    },
    {
      name: 'O‘zgaruvchan',
      value: toChartNumber(data.variableActualUzs),
      color: 'var(--chart-warning)',
    },
  ];
  const compositionTotal = composition.reduce((sum, item) => sum + item.value, 0);
  const hasComposition = composition.some((item) => item.value > 0);
  // The centre card belongs to the hovered slice only; at rest the ring and its
  // legend are enough, and the card would hide the ring.
  const displayedComposition =
    activeCompositionIndex === null ? undefined : composition[activeCompositionIndex];

  return (
    <div className="mt-4 grid gap-6 xl:grid-cols-2">
      <Card
        title="Oylik xarajatlar: doimiy va o‘zgaruvchan"
        description={`${data.year} yil, oylar kesimi`}
      >
        <div
          className="neu-chart-frame h-[300px] w-full overflow-hidden rounded-2xl px-2 pb-1 pt-4"
          aria-label="Oylik doimiy va o‘zgaruvchan xarajatlar diagrammasi"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 10, right: 10, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id="fixed-bar-premium" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="var(--chart-actual)" />
                  <stop offset="55%" stopColor="var(--chart-actual)" />
                  <stop offset="100%" stopColor="var(--chart-actual-soft)" />
                </linearGradient>
                <linearGradient id="variable-bar-premium" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="var(--chart-warning)" stopOpacity={0.72} />
                  <stop offset="55%" stopColor="var(--chart-warning)" />
                  <stop offset="100%" stopColor="var(--chart-warning)" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval="preserveStartEnd"
                tick={{ fill: 'var(--chart-axis)' }}
              />
              <YAxis
                tickFormatter={axisMoney}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={130}
                tick={{ fill: 'var(--chart-axis)' }}
              />
              <Tooltip
                formatter={(value: number) => formatMoney(String(value))}
                cursor={{ fill: 'rgb(var(--primary) / 0.08)' }}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: 'var(--chart-text)', fontWeight: 700 }}
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: 12 }} />
              <Bar
                dataKey="fixed"
                name="Doimiy"
                className="premium-chart-bar"
                fill="url(#fixed-bar-premium)"
                radius={[8, 8, 3, 3]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="variable"
                name="O‘zgaruvchan"
                className="premium-chart-bar"
                fill="url(#variable-bar-premium)"
                radius={[8, 8, 3, 3]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="Tuzilma: doimiy / o‘zgaruvchan (yil)"
        description={`${data.year} yil jami xarajat tarkibi`}
      >
        <div
          className="neu-chart-frame relative grid h-[300px] w-full place-items-center overflow-hidden rounded-2xl p-2"
          aria-label="Yillik doimiy va o‘zgaruvchan xarajatlar diagrammasi"
          onMouseEnter={() => setActiveCompositionIndex((current) => current ?? 0)}
          onMouseLeave={() => setActiveCompositionIndex(null)}
        >
          {hasComposition ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  <linearGradient id="fixed-pie-premium" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--chart-actual-soft)" />
                    <stop offset="48%" stopColor="var(--chart-actual)" />
                    <stop offset="100%" stopColor="var(--chart-actual)" stopOpacity={0.76} />
                  </linearGradient>
                  <linearGradient id="variable-pie-premium" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--chart-warning)" stopOpacity={0.7} />
                    <stop offset="48%" stopColor="var(--chart-warning)" />
                    <stop offset="100%" stopColor="var(--chart-warning)" stopOpacity={0.76} />
                  </linearGradient>
                </defs>
                <Pie
                  data={composition}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={96}
                  innerRadius={58}
                  paddingAngle={4}
                  stroke="var(--chart-raised)"
                  strokeWidth={3}
                  isAnimationActive={false}
                  onMouseEnter={(_, index) => setActiveCompositionIndex(index)}
                >
                  {composition.map((item, index) => (
                    <Cell
                      key={item.name}
                      className="premium-chart-sector"
                      fill={`url(#${index === 0 ? 'fixed-pie-premium' : 'variable-pie-premium'})`}
                      onMouseEnter={() => setActiveCompositionIndex(index)}
                    />
                  ))}
                </Pie>
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Xarajat ma’lumoti mavjud emas.</p>
          )}
          {hasComposition && displayedComposition ? (
            <div className="neu-chart-tooltip pointer-events-none absolute left-1/2 top-[43%] min-w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
                  style={{
                    backgroundColor: displayedComposition.color,
                    color: displayedComposition.color,
                  }}
                  aria-hidden="true"
                />
                <p className="text-sm font-semibold text-ink">{displayedComposition.name}</p>
              </div>
              <p className="mt-2 whitespace-nowrap text-base font-bold tabular-nums text-ink">
                {formatMoney(String(Math.trunc(displayedComposition.value)))}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                Jami xarajatning{' '}
                {formatPercent(
                  compositionTotal > 0 ? (displayedComposition.value / compositionTotal) * 100 : 0,
                )}{' '}
                qismi
              </p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
