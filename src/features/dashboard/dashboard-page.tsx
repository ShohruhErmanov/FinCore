import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, CalendarPlus, Download, ReceiptText, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/features/auth/auth-context';
import {
  AnnualFinancialOverview,
  AnnualGroupHeading,
  AnnualNetProfitTiles,
  AnnualRevenueTiles,
} from './annual-financials';
import { MonthlyNetProfit } from './monthly-net-profit';
import { dashboardApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { downloadCsv } from '@/shared/lib/csv';
import { formatMoney, formatMoneyCompact, formatPercent, toChartNumber } from '@/shared/lib/format';
import { drilldownUrl } from '@/shared/lib/url';
import type {
  AnnualExpenseSummary,
  AnnualNetProfit,
  AnnualRevenue,
  RevenueGrowth,
  TrendGranularity,
  TrendPoint,
} from '@/shared/types/domain';
import {
  Button,
  Card,
  ErrorState,
  KpiCard,
  LoadingState,
  MoneyText,
  PageHeader,
  PercentText,
  VarianceText,
} from '@/shared/ui';

const granularityOptions: Array<{ value: TrendGranularity; label: string }> = [
  { value: 'daily', label: 'Kunlik' },
  { value: 'weekly', label: 'Haftalik' },
  { value: 'monthly', label: 'Oylik' },
];

function axisMoney(value: number): string {
  return formatMoney(String(value));
}

const CHART_TOOLTIP_STYLE = {
  background: '#213149',
  color: '#EDF4FF',
  border: '1px solid rgba(43, 62, 88, 0.9)',
  borderRadius: 14,
  boxShadow: '8px 8px 18px rgba(10,20,37,.85), -8px -8px 18px rgba(43,62,88,.7)',
  padding: '10px 12px',
};

function expensePlanComparison(
  planUzs: string,
  varianceUzs: string,
  completionPct: number | null,
): string {
  const variance = BigInt(varianceUzs);
  const difference = formatMoney((variance < 0n ? -variance : variance).toString());
  const differenceLabel = variance >= 0n ? 'Rejagacha yetmagan' : 'Rejadan oshgan';
  return `Reja ${formatMoney(planUzs)} · ${differenceLabel} ${difference} · Bajarilish ${formatPercent(completionPct)}`;
}

function TrendChart({
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
  const actualColor = tone === 'revenue' ? '#6F9FFF' : '#FF8C9C';
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
                    <stop offset="0%" stopColor={tone === 'revenue' ? '#A9C9FF' : '#FFC5CE'} />
                    <stop offset="48%" stopColor={actualColor} />
                    <stop offset="100%" stopColor={tone === 'revenue' ? '#78E6CF' : '#F2BE73'} />
                  </linearGradient>
                  <linearGradient id={planGradientId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#60738F" />
                    <stop offset="50%" stopColor="#B3C4DB" />
                    <stop offset="100%" stopColor="#7187A5" />
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
                <CartesianGrid
                  strokeDasharray="0"
                  vertical={false}
                  stroke="rgba(43, 62, 88, 0.9)"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(43, 62, 88, 0.9)' }}
                  fontSize={11}
                  tick={{ fill: '#B3C4DB' }}
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
                  tick={{ fill: '#B3C4DB' }}
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
                  cursor={{ stroke: 'rgba(111, 159, 255, 0.42)', strokeWidth: 1 }}
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
                  dot={{ r: 3, fill: '#172439', stroke: actualColor, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#EDF4FF', stroke: actualColor, strokeWidth: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="plan"
                  name="Reja"
                  className="premium-chart-plan"
                  stroke={`url(#${planGradientId})`}
                  strokeWidth={2.25}
                  strokeDasharray="2 8"
                  dot={{ r: 2.25, fill: '#172439', stroke: '#B3C4DB', strokeWidth: 1.5 }}
                  activeDot={{ r: 4.5, fill: '#172439', stroke: '#B3C4DB', strokeWidth: 2 }}
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

function SummaryTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper: string;
}) {
  return (
    <div className="neu-raised rounded-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{helper}</p>
    </div>
  );
}

function exportAnnualSummary(data: AnnualExpenseSummary) {
  downloadCsv(`yillik-xulosa-${data.year}`, [
    ['Oy', 'Doimiy', 'O‘zgaruvchan', 'Jami fakt', 'Oylik reja', 'Farq (reja−fakt)', 'Bajarilish %'],
    ...data.months.map((row) => [
      row.label,
      row.fixedUzs,
      row.variableUzs,
      row.actualUzs,
      row.planUzs,
      row.varianceUzs,
      row.completionPct,
    ]),
    [
      'JAMI',
      data.fixedActualUzs,
      data.variableActualUzs,
      data.totalActualUzs,
      data.totalPlanUzs,
      data.varianceUzs,
      percentOf(data.totalActualUzs, data.totalPlanUzs),
    ],
    [],
    ['Doimiy ulushi %', data.fixedSharePct],
    ['O‘rtacha oylik xarajat', data.averageMonthlyUzs],
    ['O‘rtacha hisoblangan oylar soni', data.averageMonthsCount],
    ['O‘rtacha kiritilgan oylik reja', data.averagePlannedMonthlyUzs],
    ['O‘rtacha reja hisoblangan oylar soni', data.averagePlanMonthsCount],
    ['Eng qimmat oy', data.peakMonth?.label ?? '', data.peakMonth?.actualUzs ?? ''],
  ]);
}

function AnnualCompositionCharts({ data }: { data: AnnualExpenseSummary }) {
  const monthly = data.months.map((row) => ({
    label: row.label,
    fixed: toChartNumber(row.fixedUzs),
    variable: toChartNumber(row.variableUzs),
  }));
  const composition = [
    { name: 'Doimiy', value: toChartNumber(data.fixedActualUzs), color: '#6F9FFF' },
    { name: 'O‘zgaruvchan', value: toChartNumber(data.variableActualUzs), color: '#F2BE73' },
  ];
  const compositionTotal = composition.reduce((sum, item) => sum + item.value, 0);
  const hasComposition = composition.some((item) => item.value > 0);

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
                  <stop offset="0%" stopColor="#477FD9" />
                  <stop offset="55%" stopColor="#6F9FFF" />
                  <stop offset="100%" stopColor="#A9C9FF" />
                </linearGradient>
                <linearGradient id="variable-bar-premium" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#C88839" />
                  <stop offset="55%" stopColor="#F2BE73" />
                  <stop offset="100%" stopColor="#FFDBA4" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2B3E58" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval="preserveStartEnd"
                tick={{ fill: '#B3C4DB' }}
              />
              <YAxis
                tickFormatter={axisMoney}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={130}
                tick={{ fill: '#B3C4DB' }}
              />
              <Tooltip
                formatter={(value: number) => formatMoney(String(value))}
                cursor={{ fill: 'rgba(111,159,255,0.08)' }}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: '#EDF4FF', fontWeight: 700 }}
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
          className="neu-chart-frame grid h-[300px] w-full place-items-center overflow-hidden rounded-2xl p-2"
          aria-label="Yillik doimiy va o‘zgaruvchan xarajatlar diagrammasi"
        >
          {hasComposition ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  <linearGradient id="fixed-pie-premium" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#B7D3FF" />
                    <stop offset="48%" stopColor="#6F9FFF" />
                    <stop offset="100%" stopColor="#477FD9" />
                  </linearGradient>
                  <linearGradient id="variable-pie-premium" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFE0B0" />
                    <stop offset="48%" stopColor="#F2BE73" />
                    <stop offset="100%" stopColor="#C88839" />
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
                  stroke="#1C2C44"
                  strokeWidth={3}
                >
                  {composition.map((item, index) => (
                    <Cell
                      key={item.name}
                      className="premium-chart-sector"
                      fill={`url(#${index === 0 ? 'fixed-pie-premium' : 'variable-pie-premium'})`}
                    />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  offset={18}
                  wrapperStyle={{ outline: 'none', pointerEvents: 'none' }}
                  content={(tooltip) => {
                    const item = tooltip.payload?.[0]?.payload as
                      | { name?: string; value?: number; color?: string }
                      | undefined;
                    if (!tooltip.active || !item) return null;

                    const value = Math.trunc(item.value ?? 0);
                    const share = compositionTotal > 0 ? (value / compositionTotal) * 100 : 0;

                    return (
                      <div className="neu-chart-tooltip min-w-[180px] rounded-2xl px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
                            style={{
                              backgroundColor: item.color ?? '#6F9FFF',
                              color: item.color ?? '#6F9FFF',
                            }}
                            aria-hidden="true"
                          />
                          <p className="text-sm font-semibold text-ink">{item.name}</p>
                        </div>
                        <p className="mt-2 whitespace-nowrap text-base font-bold tabular-nums text-ink">
                          {formatMoney(String(value))}
                        </p>
                        <p className="mt-1 text-xs font-medium text-muted">
                          Jami xarajatning {formatPercent(share)} qismi
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Xarajat ma’lumoti mavjud emas.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Excel «Xulosa» varag‘ining veb ko‘rinishi. */
function AnnualSummary({
  data,
  revenue,
  netProfit,
  growth,
}: {
  data: AnnualExpenseSummary;
  revenue: AnnualRevenue;
  netProfit: AnnualNetProfit | undefined;
  growth: RevenueGrowth;
}) {
  return (
    <section aria-label="Yillik xulosa" className="mt-8">
      <h2 className="text-lg font-bold text-ink">{data.year} yil xulosasi</h2>
      <p className="mt-0.5 text-sm text-muted">
        {netProfit
          ? 'Yillik tushum, xarajat va sof foyda dinamikasi — tanlangan filial bo‘yicha.'
          : 'Yillik tushum va xarajat dinamikasi — tanlangan filial bo‘yicha.'}
      </p>

      <AnnualGroupHeading title="Tushumlar" kind="revenue" />
      <AnnualRevenueTiles data={revenue} growth={growth} />

      <AnnualGroupHeading title="Xarajatlar" kind="expense" />

      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Yillik umumiy xarajat"
          value={<MoneyText value={data.totalActualUzs} compact />}
          helper={`Reja ${formatMoney(data.totalPlanUzs, true)}, farq ${formatMoney(data.varianceUzs, true)}`}
        />
        <SummaryTile
          label="Doimiy xarajatlar (yil)"
          value={<MoneyText value={data.fixedActualUzs} compact />}
          helper="Yillik jami doimiy xarajat"
        />
        <SummaryTile
          label="O‘zgaruvchan xarajatlar (yil)"
          value={<MoneyText value={data.variableActualUzs} compact />}
          helper="Yillik jami o‘zgaruvchan xarajat"
        />
        <SummaryTile
          label="Doimiy ulushi"
          value={<PercentText value={data.fixedSharePct} />}
          helper={`Doimiy ${formatMoney(data.fixedActualUzs, true)} · O‘zgaruvchan ${formatMoney(data.variableActualUzs, true)}`}
        />
        <SummaryTile
          label="O‘rtacha oylik xarajat"
          value={<MoneyText value={data.averageMonthlyUzs} compact />}
          helper={
            data.averageMonthsCount
              ? `Fakt mavjud ${data.averageMonthsCount} oy bo‘yicha`
              : 'Fakt kiritilgan oy yo‘q'
          }
        />
        <SummaryTile
          label="Eng qimmat oy"
          value={
            data.peakMonth ? (
              <MoneyText value={data.peakMonth.actualUzs} compact />
            ) : (
              <span className="text-muted">—</span>
            )
          }
          helper={data.peakMonth ? `${data.peakMonth.label} oyi` : 'Ma’lumot yo‘q'}
        />
        <SummaryTile
          label="O‘rtacha kiritilgan oylik reja"
          value={<MoneyText value={data.averagePlannedMonthlyUzs} compact />}
          helper={
            data.averagePlanMonthsCount
              ? `Reja mavjud ${data.averagePlanMonthsCount} oy bo‘yicha`
              : 'Reja kiritilgan oy yo‘q'
          }
        />
        <SummaryTile
          label="Yillik farq"
          value={<VarianceText value={data.varianceUzs} />}
          helper="Musbat qiymat — budjetdan qolgan summa"
        />
      </div>

      {netProfit ? (
        <>
          <AnnualGroupHeading title="Sof foyda" kind="profit" />
          <AnnualNetProfitTiles data={netProfit} />
          <AnnualFinancialOverview revenue={revenue} expense={data} netProfit={netProfit} />
        </>
      ) : null}

      <Card
        title="Oylik dinamika"
        description="Doimiy va o‘zgaruvchan xarajatlar, reja bilan taqqoslash."
        className="mt-4 overflow-hidden"
        actions={
          <Button variant="secondary" size="sm" onClick={() => exportAnnualSummary(data)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">{data.year} yil oylik dinamika jadvali</caption>
            <thead>
              <tr className="border-b border-border bg-canvas/70 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3 text-left">Oy</th>
                <th className="px-4 py-3 text-right">Doimiy</th>
                <th className="px-4 py-3 text-right">O‘zgaruvchan</th>
                <th className="px-4 py-3 text-right">Jami fakt</th>
                <th className="px-4 py-3 text-right">Oylik reja</th>
                <th className="px-4 py-3 text-right">Farq</th>
                <th className="px-4 py-3 text-right">Bajarilish</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((row) => (
                <tr
                  key={row.month}
                  className={cn(
                    'border-b border-border last:border-0',
                    data.peakMonth?.month === row.month && 'bg-amber-50/60',
                  )}
                >
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                    {row.label}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <MoneyText value={row.fixedUzs} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <MoneyText value={row.variableUzs} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-ink">
                    <MoneyText value={row.actualUzs} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                    <MoneyText value={row.planUzs} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <VarianceText value={row.varianceUzs} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    <PercentText value={row.completionPct} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-canvas/70 font-bold text-ink">
                <th scope="row" className="px-4 py-3 text-left">
                  JAMI
                </th>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MoneyText value={data.fixedActualUzs} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MoneyText value={data.variableActualUzs} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MoneyText value={data.totalActualUzs} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MoneyText value={data.totalPlanUzs} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <VarianceText value={data.varianceUzs} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <PercentText value={percentOf(data.totalActualUzs, data.totalPlanUzs)} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <AnnualCompositionCharts data={data} />
    </section>
  );
}

function percentOf(actualUzs: string, planUzs: string): number | null {
  const plan = BigInt(planUzs);
  if (plan === 0n) return null;
  return Number((BigInt(actualUzs) * 10_000n) / plan) / 100;
}

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const branchesQuery = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
  });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
  });
  const period =
    searchParams.get('period') ??
    periodsQuery.data?.find((item) => item.status === 'open')?.id ??
    '';
  const periodsByYear = periodsQuery.data ?? [];
  const availableYears = [...new Set(periodsByYear.map((item) => item.year))].sort((a, b) => b - a);
  const selectYear = (year: number) => {
    // The first month of that year that exists, so the app bar's month select
    // lands on something real rather than on an id that is not in its list.
    const target = periodsByYear
      .filter((item) => item.year === year)
      .sort((a, b) => a.month - b.month)[0];
    if (!target) return;
    const next = new URLSearchParams(searchParams);
    next.set('period', target.id);
    setSearchParams(next, { replace: true });
  };

  const requestedGranularity = searchParams.get('granularity');
  const granularity: TrendGranularity =
    requestedGranularity === 'daily' || requestedGranularity === 'weekly'
      ? requestedGranularity
      : 'monthly';
  const canSeeAll = hasPermission('expense.view_all_branches');
  const visibleBranches = branchesQuery.data ?? [];
  const requestedBranch = searchParams.get('branch');
  const branch = canSeeAll
    ? (requestedBranch ?? 'all')
    : visibleBranches.some((item) => item.id === requestedBranch)
      ? (requestedBranch ?? '')
      : (visibleBranches[0]?.id ?? '');
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(period, branch, granularity),
    queryFn: ({ signal }) => dashboardApi.get({ period, branch, granularity }, signal),
    enabled: Boolean(period && branch),
  });

  function setFilter(key: 'period' | 'branch' | 'granularity', value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  if (dashboardQuery.isLoading || periodsQuery.isLoading || branchesQuery.isLoading)
    return <LoadingState label="Dashboard yuklanmoqda…" />;
  if (dashboardQuery.isError || !dashboardQuery.data)
    return <ErrorState onRetry={() => void dashboardQuery.refetch()} />;
  const data = dashboardQuery.data;
  const canViewNetProfit =
    user?.roles.some((assignment) =>
      ['director', 'business_owner', 'finance_manager'].includes(assignment.role),
    ) ?? false;
  const visibleNetProfit = canViewNetProfit ? data.annualNetProfit : undefined;
  const netResult = visibleNetProfit
    ? BigInt(data.revenueActualUzs) - BigInt(data.expenseActualUzs)
    : null;
  const heroAmountUzs = netResult?.toString() ?? data.revenueActualUzs;
  const queryBase = { period, branch };
  const trendScope =
    granularity === 'monthly'
      ? `${data.period.year} yil, oylar kesimi`
      : granularity === 'weekly'
        ? `${data.period.label}, haftalar kesimi`
        : `${data.period.label}, kunlar kesimi`;

  return (
    <div>
      <PageHeader
        title="Moliyaviy dashboard"
        description={`${data.period.label} bo‘yicha server hisoblagan tushum va xarajat reja-fakti.`}
        actions={
          <>
            {hasPermission('revenue.create') ? (
              <Link to={routes.revenueNew}>
                <Button>
                  <CalendarPlus className="h-4 w-4" />
                  Tushum kiritish
                </Button>
              </Link>
            ) : null}
            {hasPermission('expense.create') ? (
              <Link to={routes.expenseNew}>
                <Button variant="secondary">
                  <ReceiptText className="h-4 w-4" />
                  Xarajat kiritish
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <section
        aria-label="FinCore Pulse"
        className="neu-hero relative mb-5 overflow-hidden rounded-[24px] border border-border/70 p-6 text-ink sm:p-7"
      >
        <div className="relative grid gap-7 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <div className="neu-inset inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              FinCore Pulse
            </div>
            <p className="mt-5 max-w-2xl text-sm font-medium text-muted">
              {netResult === null
                ? `${data.period.label} uchun amaldagi tushum`
                : `${data.period.label} uchun tushum va xarajatning tezkor operatsion natijasi`}
            </p>
            <div className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
              <MoneyText value={heroAmountUzs} compact />
            </div>
            <p className="mt-2 text-sm text-muted">
              {netResult === null
                ? 'Tanlangan davr bo‘yicha qayd etilgan amaldagi tushum.'
                : netResult > 0n
                  ? 'Tushum xarajatdan yuqori — davr natijasi musbat.'
                  : netResult < 0n
                    ? 'Xarajat tushumdan yuqori — rahbar e’tibori talab qilinadi.'
                    : 'Davr uchun tushum va xarajat ma’lumoti hali shakllanmagan.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/70 p-4 neu-on-navy">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-muted">Tushum rejasi</span>
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {formatPercent(data.revenueCompletionPct)}
              </p>
              <div className="neu-track mt-3 h-1.5 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.max(0, Math.min(data.revenueCompletionPct ?? 0, 100))}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3 text-xs neu-on-navy">
              <span className="text-muted">Ma’lumot holati</span>
              <span className="inline-flex items-center gap-2 font-bold text-ink">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Server agregati
              </span>
            </div>
          </div>
        </div>
      </section>

      {visibleNetProfit ? (
        <MonthlyNetProfit
          data={visibleNetProfit}
          years={availableYears}
          onYearChange={selectYear}
        />
      ) : null}

      <section
        aria-label="Tushum ko‘rsatkichlari"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Tushum rejasi"
          value={<MoneyText value={data.revenuePlanUzs} compact />}
          helper={`${data.period.label} uchun oylik reja`}
          tone="info"
          to={drilldownUrl(routes.revenuePlans, { period })}
          demo={data.isDemo}
        />
        <KpiCard
          label="Amaldagi tushum"
          value={<MoneyText value={data.revenueActualUzs} compact />}
          helper={`Reja bajarilishi ${formatPercent(data.revenueCompletionPct)}`}
          tone={
            data.revenueCompletionPct !== null && data.revenueCompletionPct >= 90
              ? 'success'
              : 'warning'
          }
          to={drilldownUrl(routes.revenues, queryBase)}
          demo={data.isDemo}
        />
        <KpiCard
          label="Jami xarajatlar"
          value={<MoneyText value={data.expenseActualUzs} compact />}
          helper={expensePlanComparison(
            data.expensePlanUzs,
            data.expenseVarianceUzs,
            data.expenseCompletionPct,
          )}
          tone="neutral"
          to={drilldownUrl(routes.expenseAnalytics, queryBase)}
          demo={data.isDemo}
        />
        <KpiCard
          label="Xarajat rejasi"
          value={<MoneyText value={data.expensePlanUzs} compact />}
          helper="Budjetdagi tasdiqlangan reja"
          tone="info"
          to={drilldownUrl(routes.expensePlanAnalytics, queryBase)}
        />
      </section>

      <section aria-label="Xarajat ko‘rsatkichlari" className="mt-4 grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="Xarajat variansi"
          value={<MoneyText value={data.expenseVarianceUzs} compact />}
          helper="Musbat qiymat — budjetdan qolgan summa"
          tone={BigInt(data.expenseVarianceUzs) >= 0n ? 'success' : 'danger'}
          to={drilldownUrl(routes.monthlyReport, queryBase)}
        />
        <KpiCard
          label="Tushum farqi"
          value={<MoneyText value={data.revenueVarianceUzs} compact />}
          helper="Musbat qiymat — rejadan ortiq tushum"
          tone={BigInt(data.revenueVarianceUzs) >= 0n ? 'success' : 'danger'}
          to={drilldownUrl(routes.revenuePlans, { period })}
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Reja va amaldagi dinamika</h2>
          <p className="mt-0.5 text-sm text-muted">{trendScope}</p>
        </div>
        <div
          role="group"
          aria-label="Diagramma kesimi"
          className="neu-inset inline-flex rounded-lg p-1"
        >
          {granularityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={granularity === option.value}
              onClick={() => setFilter('granularity', option.value)}
              className={cn(
                'min-h-9 rounded-md px-4 text-sm font-semibold transition',
                granularity === option.value
                  ? 'bg-primary text-[#101C2F] shadow-[var(--neu-shadow-1)]'
                  : 'text-slate-600 hover:bg-surface/70',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <TrendChart
          title="Tushum: reja va amalda"
          description={trendScope}
          points={data.revenueTrend}
          ariaLabel="Tushum reja va amalda diagrammasi"
          tone="revenue"
        />
        <TrendChart
          title="Xarajat: reja va amalda"
          description={trendScope}
          points={data.expenseTrend}
          ariaLabel="Xarajat reja va amalda diagrammasi"
          tone="expense"
        />
      </div>

      <AnnualSummary
        data={data.annual}
        revenue={data.annualRevenue}
        netProfit={visibleNetProfit}
        growth={data.revenueGrowth}
      />

      <Card
        title="Filiallar kesimi"
        description="Tushum va xarajat rejasining bajarilishi"
        className="mt-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {data.branches.map((item) => (
            <div key={item.branchId} className="neu-raised-sm rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <p className="font-semibold text-ink">{item.name}</p>
                <Link
                  to={drilldownUrl(routes.revenues, { period, branch: item.branchId })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Kunlik tushum <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">
                        Tushum · reja {formatMoney(item.revenuePlanUzs)}
                      </p>
                      <MoneyText
                        value={item.revenueActualUzs}
                        className="text-lg font-bold text-ink"
                      />
                    </div>
                    <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-700">
                      <PercentText value={item.revenueCompletionPct} />
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full neu-track">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{
                        width: `${Math.max(0, Math.min(item.revenueCompletionPct ?? 0, 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">
                        Xarajat · reja {formatMoney(item.expensePlanUzs)}
                      </p>
                      <MoneyText
                        value={item.expenseActualUzs}
                        className="text-lg font-bold text-ink"
                      />
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
                      <PercentText value={item.expenseCompletionPct} />
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full neu-track">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.max(0, Math.min(item.expenseCompletionPct ?? 0, 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Link
          to={drilldownUrl(routes.revenues, queryBase)}
          className="neu-raised neu-interactive flex items-center gap-3 rounded-card p-4 hover:border-blue-300"
        >
          <CalendarPlus className="h-5 w-5 text-success" />
          <div>
            <p className="text-sm font-semibold">Kunlik tushum jurnali</p>
            <p className="text-xs text-muted">Kassirlar kiritgan kunlik yozuvlar</p>
          </div>
        </Link>
        <Link
          to={drilldownUrl(routes.expenses, queryBase)}
          className="neu-raised neu-interactive flex items-center gap-3 rounded-card p-4 hover:border-blue-300"
        >
          <ReceiptText className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Xarajat ledgeri</p>
            <p className="text-xs text-muted">Kategoriya va bo‘lim detali</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
