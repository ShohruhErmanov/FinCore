import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/shared/lib/cn';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/shared/lib/chart-theme';
import { formatMoney, formatMoneyCompact, formatPercent, toChartNumber } from '@/shared/lib/format';
import type { TrendPoint } from '@/shared/types/domain';
import { Card } from '@/shared/ui';
import { percentOf } from './dashboard-format';

export function TrendChart({
  title,
  description,
  points,
  ariaLabel,
  tone,
}: {
  title: string;
  description: string;
  points: TrendPoint[];
  ariaLabel: string;
  tone: 'revenue' | 'expense';
}) {
  const data = points.map((point) => ({
    label: point.label,
    plan: toChartNumber(point.planUzs),
    actual: toChartNumber(point.actualUzs),
  }));
  const totalPlan = points.reduce((sum, point) => sum + BigInt(point.planUzs), 0n);
  const totalActual = points.reduce((sum, point) => sum + BigInt(point.actualUzs), 0n);
  const completion = percentOf(totalActual.toString(), totalPlan.toString());
  const hasData = totalPlan !== 0n || totalActual !== 0n;
  const actualColor = tone === 'revenue' ? CHART_COLORS.actual : CHART_COLORS.danger;
  const gradientId = `actual-${tone}-gradient`;
  const strokeGradientId = `actual-${tone}-stroke`;
  const planGradientId = `plan-${tone}-stroke`;
  const glowId = `actual-${tone}-glow`;

  return (
    <Card title={title} description={description}>
      <div role="region" aria-label={ariaLabel}>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="neu-chart-stat rounded-xl px-3.5 py-3">
            <dt className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
              Reja jami
            </dt>
            <dd
              className="mt-1.5 whitespace-nowrap text-base font-semibold tabular-nums text-slate-800"
              title={formatMoney(totalPlan.toString())}
            >
              {formatMoneyCompact(totalPlan.toString())}
            </dd>
          </div>

          <div
            className={cn(
              'neu-chart-stat rounded-xl px-3.5 py-3',
              tone === 'revenue'
                ? 'border-cyan-100 bg-cyan-50/60'
                : 'border-blue-100 bg-blue-50/60',
            )}
          >
            <dt className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  tone === 'revenue' ? 'bg-cyan-500' : 'bg-blue-500',
                )}
                aria-hidden="true"
              />
              Amalda jami
            </dt>
            <dd
              className={cn(
                'mt-1.5 whitespace-nowrap text-base font-semibold tabular-nums',
                tone === 'revenue' ? 'text-cyan-700' : 'text-blue-700',
              )}
              title={formatMoney(totalActual.toString())}
            >
              {formatMoneyCompact(totalActual.toString())}
            </dd>
          </div>

          <div className="neu-chart-stat col-span-2 rounded-xl px-3.5 py-3 sm:col-span-1">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Reja bajarilishi
            </dt>
            <dd className="mt-1.5 text-base font-semibold tabular-nums text-slate-800">
              {totalPlan === 0n ? 'Reja yo‘q' : formatPercent(completion)}
            </dd>
          </div>
        </dl>

        {hasData ? (
          <div className="neu-chart-frame mt-5 h-[280px] w-full overflow-hidden rounded-2xl px-2 pb-1 pt-4 sm:h-[320px] sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={actualColor} stopOpacity={0.42} />
                    <stop offset="58%" stopColor={actualColor} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={actualColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={strokeGradientId} x1="0" y1="0" x2="1" y2="0">
                    <stop
                      offset="0%"
                      stopColor={
                        tone === 'revenue' ? 'var(--chart-actual-soft)' : 'var(--chart-danger)'
                      }
                    />
                    <stop offset="48%" stopColor={actualColor} />
                    <stop
                      offset="100%"
                      stopColor={
                        tone === 'revenue' ? 'var(--chart-success)' : 'var(--chart-warning)'
                      }
                    />
                  </linearGradient>
                  <linearGradient id={planGradientId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--chart-axis)" />
                    <stop offset="50%" stopColor="var(--chart-plan)" />
                    <stop offset="100%" stopColor="var(--chart-axis)" />
                  </linearGradient>
                  <filter id={glowId} x="-30%" y="-40%" width="160%" height="180%">
                    <feGaussianBlur stdDeviation="3.2" result="softGlow" />
                    <feColorMatrix
                      in="softGlow"
                      type="matrix"
                      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .58 0"
                      result="coloredGlow"
                    />
                    <feMerge>
                      <feMergeNode in="coloredGlow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  fontSize={11}
                  tick={{ fill: 'var(--chart-axis)' }}
                  interval="preserveStartEnd"
                  tickMargin={10}
                />
                <YAxis
                  tickFormatter={(value: number) =>
                    formatMoneyCompact(String(Math.trunc(value))).replace(' so‘m', '')
                  }
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  tick={{ fill: 'var(--chart-axis)' }}
                  width={66}
                  tickMargin={6}
                />
                <Tooltip
                  content={(tooltip) => {
                    const point = tooltip.payload?.[0]?.payload as
                      | { plan?: number; actual?: number }
                      | undefined;
                    if (!tooltip.active || !point) return null;
                    return (
                      <div style={CHART_TOOLTIP_STYLE}>
                        <p className="mb-1.5 font-bold text-ink">{tooltip.label}</p>
                        <p className="flex items-center gap-2 py-0.5 text-sm text-muted">
                          <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden="true" />
                          Reja:{' '}
                          <strong className="font-semibold text-ink">
                            {formatMoney(String(Math.trunc(point.plan ?? 0)))}
                          </strong>
                        </p>
                        <p className="flex items-center gap-2 py-0.5 text-sm text-muted">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: actualColor }}
                            aria-hidden="true"
                          />
                          Amalda:{' '}
                          <strong className="font-semibold text-ink">
                            {formatMoney(String(Math.trunc(point.actual ?? 0)))}
                          </strong>
                        </p>
                      </div>
                    );
                  }}
                  cursor={{ stroke: 'rgb(var(--primary) / 0.42)', strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  name="Amalda"
                  className="premium-chart-line"
                  stroke={`url(#${strokeGradientId})`}
                  strokeWidth={3.75}
                  fill={`url(#${gradientId})`}
                  filter={`url(#${glowId})`}
                  dot={{ r: 3, fill: 'var(--chart-canvas)', stroke: actualColor, strokeWidth: 2 }}
                  activeDot={{
                    r: 6,
                    fill: 'var(--chart-raised)',
                    stroke: actualColor,
                    strokeWidth: 3,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="plan"
                  name="Reja"
                  className="premium-chart-plan"
                  stroke={`url(#${planGradientId})`}
                  strokeWidth={2.25}
                  strokeDasharray="2 8"
                  dot={{
                    r: 2.25,
                    fill: 'var(--chart-canvas)',
                    stroke: 'var(--chart-axis)',
                    strokeWidth: 1.5,
                  }}
                  activeDot={{
                    r: 4.5,
                    fill: 'var(--chart-canvas)',
                    stroke: 'var(--chart-axis)',
                    strokeWidth: 2,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-5 grid min-h-64 place-items-center neu-inset rounded-2xl px-6 text-center">
            <div>
              <p className="font-semibold text-slate-700">Bu kesim uchun ma’lumot mavjud emas</p>
              <p className="mt-1 text-sm text-muted">
                Reja yoki amaldagi summa kiritilganda diagramma paydo bo‘ladi.
              </p>
            </div>
          </div>
        )}
        {hasData ? (
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] font-semibold">
            <span className="neu-chart-legend-chip">
              <span className="w-5 border-t-2 border-dashed border-slate-400" aria-hidden="true" />
              Reja
            </span>
            <span className="neu-chart-legend-chip">
              <span
                className="h-0.5 w-5 rounded-full"
                style={{ backgroundColor: actualColor }}
                aria-hidden="true"
              />
              Amalda
            </span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
