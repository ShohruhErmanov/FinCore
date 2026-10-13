import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  CreditCard,
  Landmark,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatMoney, formatMoneyCompact, formatPercent, toChartNumber } from '@/shared/lib/format';
import type { AnnualNetProfit, NetProfitMonth } from '@/shared/types/domain';
import { Select } from '@/shared/ui';

/**
 * Twelve months of net profit — collected minus spent — in one glance.
 *
 * Sits below FinCore Pulse and deliberately borrows its Deep Navy raised surface
 * and soft inset tiles. Pulse answers "how is
 * this month going"; this answers "how has the year gone", and the two read as
 * one system rather than two widgets.
 *
 * Every month is rendered, including empty ones. A gap in the year is
 * information — showing only the months with data would quietly imply the rest
 * broke even.
 */
export function MonthlyNetProfit({
  data,
  years,
  onYearChange,
}: {
  data: AnnualNetProfit;
  /** Years the app bar knows about; a single year renders as a static chip. */
  years?: number[];
  onYearChange?: (year: number) => void;
}) {
  const paymentMethods = (data.paymentMethods ?? []).filter((method) =>
    CORE_PAYMENT_METHODS.has(method.code),
  );
  const paymentMethodMonths = data.paymentMethodMonths ?? [];
  const chartData = data.months.map((row) => {
    const paymentMonth = paymentMethodMonths.find((month) => month.month === row.month);
    return {
      name: row.label,
      total: toChartNumber(row.netProfitUzs),
      ...Object.fromEntries(
        (paymentMonth?.paymentMethods ?? []).map((method) => [
          method.code,
          toChartNumber(method.netProfitUzs),
        ]),
      ),
    };
  });
  const selectable = (years ?? []).length > 1 && onYearChange !== undefined;
  const totalStrokeId = `net-profit-total-stroke-${data.year}`;
  const totalGlowId = `net-profit-total-glow-${data.year}`;

  return (
    <section
      aria-label="Oylik sof foyda"
      className="neu-hero relative mb-5 overflow-hidden rounded-[24px] border border-border/70 p-6 text-ink sm:p-7"
    >
      <header className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.02em] sm:text-xl">
            {data.year}-yil oylik sof foyda
          </h2>
          <p className="mt-1 text-sm text-muted">Har bir oy bo‘yicha sof foyda ko‘rsatkichi</p>
        </div>

        {selectable ? (
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="sr-only">Yil</span>
            <Select
              aria-label="Yil"
              value={data.year}
              onChange={(event) => onYearChange?.(Number(event.target.value))}
              className="min-h-9 w-24 rounded-full py-1.5 font-semibold"
            >
              {years?.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <span className="neu-inset rounded-full px-3 py-1.5 text-sm font-semibold">
            {data.year}
          </span>
        )}
      </header>

      <div className="relative mt-5 grid gap-3 lg:grid-cols-[1.15fr_2fr]">
        <div className="rounded-2xl border border-border/70 p-5 neu-on-navy">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Yillik sof foyda
          </p>
          <p className="mt-2 break-words text-2xl font-bold tracking-[-0.03em] tabular-nums text-ink sm:text-3xl">
            {formatMoney(data.totalNetProfitUzs)}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            Fakt tushumdan fakt xarajat ayrilgan yillik natija
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {paymentMethods.map((method) => (
            <PaymentMethodCard key={method.paymentMethodId} method={method} />
          ))}
        </div>
      </div>

      {/* The months and their chart are one reading — the tiles give the exact
          figure, the line the shape — so from xl up they share a row. Halves at
          xl, because a narrower tile column would cut "−182 672 000 so‘m" short
          on a 1280px screen with the sidebar open; the chart takes more of the
          row once 2xl leaves room for both. */}
      <div className="relative mt-5 grid gap-3 xl:grid-cols-2 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul
          aria-label="Oylar"
          className="grid grid-cols-2 content-start gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3"
        >
          {data.months.map((row) => (
            <MonthTile key={row.month} row={row} />
          ))}
        </ul>

        <div className="neu-raised-sm flex min-w-0 flex-col rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <span className="neu-inset grid h-7 w-7 place-items-center rounded-lg text-primary">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              12 oylik sof foyda dinamikasi
            </p>
          </div>
          {/* Stretched to the tiles' height beside them. The chart sits in an
              absolute layer so its measured SVG never feeds back into the row
              height — otherwise the row could grow and never shrink again. */}
          <div className="neu-chart-frame relative mt-3 h-40 w-full overflow-hidden rounded-2xl p-1.5 xl:h-auto xl:min-h-40 xl:flex-1">
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={totalStrokeId} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#B7D3FF" />
                      <stop offset="42%" stopColor="#6F9FFF" />
                      <stop offset="72%" stopColor="#80B3FF" />
                      <stop offset="100%" stopColor="#78E6CF" />
                    </linearGradient>
                    <filter id={totalGlowId} x="-30%" y="-45%" width="160%" height="190%">
                      <feGaussianBlur stdDeviation="3.2" result="softGlow" />
                      <feColorMatrix
                        in="softGlow"
                        type="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .62 0"
                        result="coloredGlow"
                      />
                      <feMerge>
                        <feMergeNode in="coloredGlow" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid stroke="rgba(43,62,88,0.9)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#B3C4DB', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#B3C4DB', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={(value: number) => formatMoneyCompact(String(Math.trunc(value)))}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(111,159,255,0.38)' }}
                    contentStyle={{
                      background: '#213149',
                      border: '1px solid rgba(43,62,88,0.9)',
                      borderRadius: 12,
                      color: '#EDF4FF',
                      boxShadow:
                        '8px 8px 18px rgba(10,20,37,.85), -8px -8px 18px rgba(43,62,88,.7)',
                    }}
                    formatter={(value, name) => [
                      formatMoney(String(Math.trunc(Number(value)))),
                      name === 'total'
                        ? 'Jami sof foyda'
                        : (paymentMethods.find((method) => method.code === name)?.name ??
                          String(name)),
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="total"
                    className="premium-chart-line"
                    stroke={`url(#${totalStrokeId})`}
                    strokeWidth={3.75}
                    filter={`url(#${totalGlowId})`}
                    dot={{ r: 3, fill: '#172439', stroke: '#83B0FF', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#EDF4FF', stroke: '#6F9FFF', strokeWidth: 3 }}
                  />
                  {paymentMethods.map((method, index) => (
                    <Line
                      key={method.paymentMethodId}
                      type="monotone"
                      dataKey={method.code}
                      name={method.code}
                      className="premium-chart-plan"
                      stroke={METHOD_COLORS[index % METHOD_COLORS.length]}
                      strokeWidth={2}
                      strokeDasharray="2 7"
                      dot={false}
                      activeDot={{ r: 4.5, fill: '#172439', strokeWidth: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-muted">
            <ChartLegend color="#6F9FFF" label="Jami sof foyda" />
            {paymentMethods.map((method, index) => (
              <ChartLegend
                key={method.paymentMethodId}
                color={METHOD_COLORS[index % METHOD_COLORS.length] ?? '#7890AE'}
                label={method.name}
                dashed
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-xl border border-border/70 neu-on-navy">
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            12 oylik to‘lov usullari tahlili
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead className="text-[10px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Oy</th>
                {paymentMethods.map((method) => (
                  <th key={method.paymentMethodId} className="px-3 py-1.5 text-right font-semibold">
                    {method.name}
                  </th>
                ))}
                <th className="px-3 py-1.5 text-right font-semibold">Jami</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethodMonths.map((month) => (
                <tr key={month.month} className="border-t border-border/50">
                  <th className="px-3 py-1 font-semibold text-ink">{month.label}</th>
                  {paymentMethods.map((method) => {
                    const amount =
                      month.paymentMethods.find((item) => item.code === method.code)
                        ?.netProfitUzs ?? '0';
                    return (
                      <td
                        key={method.paymentMethodId}
                        className={cn(
                          'px-3 py-1 text-right tabular-nums',
                          // Most of a young year is zeros; dimming them lets
                          // the months that moved stand out.
                          amount === '0' ? 'text-slate-400' : 'text-muted',
                        )}
                      >
                        {formatMoney(amount)}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      'px-3 py-1 text-right font-semibold tabular-nums',
                      month.totalNetProfitUzs === '0' ? 'text-slate-400' : 'text-ink',
                    )}
                  >
                    {formatMoney(month.totalNetProfitUzs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="relative mt-3 grid gap-2 sm:grid-cols-3">
        <SummaryChip
          label="Yillik jami sof foyda"
          value={formatMoney(data.totalNetProfitUzs)}
          tone={BigInt(data.totalNetProfitUzs) >= 0n ? 'positive' : 'negative'}
          helper={
            data.monthsWithData === 0
              ? 'Ma’lumot kiritilgan oy yo‘q'
              : `Ma’lumot mavjud ${data.monthsWithData} oy bo‘yicha`
          }
        />
        <SummaryChip
          label="Eng yuqori foyda"
          value={data.bestMonth ? formatMoney(data.bestMonth.netProfitUzs) : '—'}
          {...(data.bestMonth ? { helper: `${data.bestMonth.label} oyi` } : {})}
          tone="positive"
        />
        <SummaryChip
          label="Eng past foyda"
          value={data.worstMonth ? formatMoney(data.worstMonth.netProfitUzs) : '—'}
          {...(data.worstMonth ? { helper: `${data.worstMonth.label} oyi` } : {})}
          tone={
            data.worstMonth && BigInt(data.worstMonth.netProfitUzs) < 0n ? 'negative' : 'neutral'
          }
        />
      </div>
    </section>
  );
}

const CORE_PAYMENT_METHODS = new Set(['CASH', 'CARD', 'BANK_TRANSFER']);
const METHOD_COLORS = ['#6EE3AE', '#82ADFF', '#F2BE73'];

function PaymentMethodCard({ method }: { method: AnnualNetProfit['paymentMethods'][number] }) {
  const Icon = paymentMethodIcon(method.code);
  const net = BigInt(method.netProfitUzs);
  return (
    <article className="rounded-2xl border border-border/70 p-4 neu-on-navy">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">{method.name}</p>
          <p
            className={cn(
              'mt-1 break-words text-lg font-bold tabular-nums',
              net < 0n ? 'text-red-700' : 'text-ink',
            )}
          >
            {formatMoney(method.netProfitUzs)}
          </p>
        </div>
        <span className="neu-raised-sm grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold text-primary">
        Jami natijaning {formatPercent(method.sharePct, 2)}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-muted">
        Tushum {formatMoney(method.revenueUzs)} · Xarajat {formatMoney(method.expenseUzs)}
      </p>
    </article>
  );
}

function paymentMethodIcon(code: string) {
  if (code === 'CASH') return Banknote;
  if (code === 'CARD' || code === 'CORPORATE_CARD') return CreditCard;
  if (code === 'BANK_TRANSFER') return Landmark;
  return WalletCards;
}

function ChartLegend({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="neu-chart-legend-chip">
      <span
        className={cn('h-0.5 w-5 rounded-full', dashed && 'border-t border-dashed bg-transparent')}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function MonthTile({ row }: { row: NetProfitMonth }) {
  const net = BigInt(row.netProfitUzs);
  const positive = net > 0n;
  const negative = net < 0n;

  return (
    <li
      className={cn(
        'rounded-lg border px-2 py-1.5 neu-on-navy transition-colors',
        row.hasData ? 'border-border/70' : 'border-border/45 text-slate-400',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{row.label}</p>

      {row.hasData ? (
        <>
          <p
            className={cn(
              // Beside the chart on a 1280px screen a tile is ~140px wide; one
              // pixel of type is what keeps "−182 672 000 so‘m" whole there.
              'mt-0.5 truncate text-[13px] font-bold tabular-nums xl:max-2xl:text-xs',
              positive && 'text-green-700',
              negative && 'text-red-700',
              !positive && !negative && 'text-ink',
            )}
            title={formatMoney(row.netProfitUzs)}
          >
            {formatMoney(row.netProfitUzs)}
          </p>
          {row.changePct === null ? (
            <p className="text-[10px] text-slate-400">—</p>
          ) : (
            <p
              className={cn(
                'flex items-center gap-1 truncate text-[10px] font-semibold tabular-nums',
                row.changePct >= 0 ? 'text-green-700' : 'text-red-700',
              )}
              title={
                row.comparedToLabel
                  ? `${row.comparedToLabel} oyiga nisbatan ${formatPercent(row.changePct, 1)}`
                  : formatPercent(row.changePct, 1)
              }
            >
              {row.changePct >= 0 ? (
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3 w-3" aria-hidden="true" />
              )}
              {/* A sparse year can produce "4 929 124,5%", which no tile this
                  size can hold. The arrow carries the direction, the title the
                  exact figure and the month it is measured against. */}
              {Math.abs(row.changePct) >= 1000 ? '>999%' : formatPercent(row.changePct, 1)}
              {row.comparedToLabel ? (
                <span className="font-normal text-muted">· {row.comparedToLabel}</span>
              ) : null}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-0.5 text-[13px] font-bold tabular-nums">—</p>
          <p className="text-[10px]">Ma’lumot yo‘q</p>
        </>
      )}
    </li>
  );
}

function SummaryChip({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <div className="rounded-xl border border-border/70 px-3 py-2 neu-on-navy">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-[15px] font-bold tabular-nums',
          tone === 'positive' && 'text-green-700',
          tone === 'negative' && 'text-red-700',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {value}
      </p>
      {helper ? <p className="text-[10px] text-muted">{helper}</p> : null}
    </div>
  );
}
