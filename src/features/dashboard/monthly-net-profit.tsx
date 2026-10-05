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

/**
 * Twelve months of net profit — collected minus spent — in one glance.
 *
 * Sits below FinCore Pulse and deliberately borrows its surface: the same navy
 * gradient, the same glass panels, the same cyan accent. Pulse answers "how is
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

  return (
    <section
      aria-label="Oylik sof foyda"
      className="relative mb-5 overflow-hidden rounded-[24px] border border-blue-400/20 bg-[linear-gradient(140deg,#061634_0%,#0a2a5e_58%,#0f47a8_100%)] p-6 text-white shadow-[0_28px_70px_-36px_rgba(30,64,175,0.85)] sm:p-7"
    >
      <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-1/4 h-40 w-80 rounded-full bg-blue-400/15 blur-3xl" />

      <header className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.02em] sm:text-xl">
            {data.year}-yil oylik sof foyda
          </h2>
          <p className="mt-1 text-sm text-blue-100/85">
            Har bir oy bo‘yicha sof foyda ko‘rsatkichi
          </p>
        </div>

        {selectable ? (
          <label className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur">
            <span className="sr-only">Yil</span>
            <select
              aria-label="Yil"
              value={data.year}
              onChange={(event) => onYearChange?.(Number(event.target.value))}
              className="cursor-pointer appearance-none bg-transparent pr-1 text-white outline-none [&>option]:text-ink"
            >
              {years?.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur">
            {data.year}
          </span>
        )}
      </header>

      <div className="relative mt-5 grid gap-3 lg:grid-cols-[1.15fr_2fr]">
        <div className="rounded-2xl border border-cyan-200/20 bg-white/[0.1] p-5 backdrop-blur-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100">
            Yillik sof foyda
          </p>
          <p className="mt-2 break-words text-2xl font-bold tracking-[-0.03em] tabular-nums text-white sm:text-3xl">
            {formatMoney(data.totalNetProfitUzs)}
          </p>
          <p className="mt-2 text-xs leading-5 text-blue-100/70">
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

        <div className="flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-100">
            12 oylik sof foyda dinamikasi
          </p>
          {/* Stretched to the tiles' height beside them. The chart sits in an
              absolute layer so its measured SVG never feeds back into the row
              height — otherwise the row could grow and never shrink again. */}
          <div className="relative mt-3 h-40 w-full xl:h-auto xl:min-h-40 xl:flex-1">
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'rgba(219,234,254,0.75)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(219,234,254,0.6)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={(value: number) => formatMoneyCompact(String(Math.trunc(value)))}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(103,232,249,0.35)' }}
                    contentStyle={{
                      background: '#071a3b',
                      border: '1px solid rgba(147,197,253,0.25)',
                      borderRadius: 12,
                      color: '#fff',
                    }}
                    formatter={(value, name) => [
                      formatMoney(String(Math.trunc(Number(value)))),
                      name === 'total'
                        ? 'Jami sof foyda'
                        : (paymentMethods.find((method) => method.code === name)?.name ?? String(name)),
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="total"
                    stroke="#67e8f9"
                    strokeWidth={3}
                    dot={{ r: 2.5, fill: '#67e8f9', strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                  {paymentMethods.map((method, index) => (
                    <Line
                      key={method.paymentMethodId}
                      type="monotone"
                      dataKey={method.code}
                      name={method.code}
                      stroke={METHOD_COLORS[index % METHOD_COLORS.length]}
                      strokeWidth={1.8}
                      strokeDasharray="5 4"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-medium text-blue-100/75">
            <ChartLegend color="#67e8f9" label="Jami sof foyda" />
            {paymentMethods.map((method, index) => (
              <ChartLegend
                key={method.paymentMethodId}
                color={METHOD_COLORS[index % METHOD_COLORS.length] ?? '#ffffff'}
                label={method.name}
                dashed
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-xl border border-white/15 bg-white/[0.07] backdrop-blur-md">
        <div className="border-b border-white/10 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-100">
            12 oylik to‘lov usullari tahlili
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead className="text-[10px] uppercase tracking-[0.08em] text-blue-100/65">
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
                <tr key={month.month} className="border-t border-white/[0.08]">
                  <th className="px-3 py-1 font-semibold text-white">{month.label}</th>
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
                          amount === '0' ? 'text-blue-100/30' : 'text-blue-100/80',
                        )}
                      >
                        {formatMoney(amount)}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      'px-3 py-1 text-right font-semibold tabular-nums',
                      month.totalNetProfitUzs === '0' ? 'text-blue-100/30' : 'text-white',
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
const METHOD_COLORS = ['#34d399', '#a78bfa', '#fbbf24'];

function PaymentMethodCard({ method }: { method: AnnualNetProfit['paymentMethods'][number] }) {
  const Icon = paymentMethodIcon(method.code);
  const net = BigInt(method.netProfitUzs);
  return (
    <article className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-blue-100/80">{method.name}</p>
          <p
            className={cn(
              'mt-1 break-words text-lg font-bold tabular-nums',
              net < 0n ? 'text-rose-300' : 'text-white',
            )}
          >
            {formatMoney(method.netProfitUzs)}
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-cyan-200">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold text-cyan-200">
        Jami natijaning {formatPercent(method.sharePct, 2)}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-blue-100/55">
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
    <span className="inline-flex items-center gap-1.5">
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
        'rounded-lg border px-2 py-1.5 backdrop-blur-md transition-colors',
        row.hasData
          ? 'border-white/15 bg-white/[0.08]'
          : 'border-white/[0.06] bg-white/[0.02] text-blue-100/45',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-100/80">
        {row.label}
      </p>

      {row.hasData ? (
        <>
          <p
            className={cn(
              // Beside the chart on a 1280px screen a tile is ~140px wide; one
              // pixel of type is what keeps "−182 672 000 so‘m" whole there.
              'mt-0.5 truncate text-[13px] font-bold tabular-nums xl:max-2xl:text-xs',
              positive && 'text-emerald-300',
              negative && 'text-rose-300',
              !positive && !negative && 'text-white',
            )}
            title={formatMoney(row.netProfitUzs)}
          >
            {formatMoney(row.netProfitUzs)}
          </p>
          {row.changePct === null ? (
            <p className="text-[10px] text-blue-100/50">—</p>
          ) : (
            <p
              className={cn(
                'flex items-center gap-1 truncate text-[10px] font-semibold tabular-nums',
                row.changePct >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90',
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
                <span className="font-normal text-blue-100/60">· {row.comparedToLabel}</span>
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
    <div className="rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2 backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-100">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-[15px] font-bold tabular-nums',
          tone === 'positive' && 'text-emerald-300',
          tone === 'negative' && 'text-rose-300',
          tone === 'neutral' && 'text-white',
        )}
      >
        {value}
      </p>
      {helper ? <p className="text-[10px] text-blue-100/70">{helper}</p> : null}
    </div>
  );
}
