import { cn } from '@/shared/lib/cn';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import type {
  AnnualExpenseSummary,
  AnnualNetProfit,
  AnnualRevenue,
  RevenueGrowth,
} from '@/shared/types/domain';

/**
 * The revenue and net-profit halves of the annual summary.
 *
 * The expense half already existed and is untouched; these sit beside it so the
 * section reads as one chain — what came in, what went out, what is left —
 * rather than as an expense report with extras bolted on.
 *
 * Colour carries the meaning consistently: revenue is the blue/cyan family,
 * expense the neutral/amber one, profit emerald, and a loss red. Nothing is
 * saturated; this is a light, quiet dashboard.
 */

const ACCENT = {
  revenue: { dot: 'bg-sky-500', text: 'text-sky-700', bar: 'bg-sky-500' },
  expense: { dot: 'bg-amber-500', text: 'text-amber-700', bar: 'bg-amber-500' },
  profit: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    bar: 'bg-emerald-500',
  },
} as const;

function Tile({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  helper: string;
  tone?: 'neutral' | 'revenue' | 'expense' | 'profit' | 'loss';
}) {
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          'mt-2 text-xl font-bold tabular-nums text-ink',
          tone === 'revenue' && ACCENT.revenue.text,
          tone === 'profit' && ACCENT.profit.text,
          tone === 'loss' && 'text-danger',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">{helper}</p>
    </div>
  );
}

/** A labelled band inside the annual section, so the three groups read apart. */
export function AnnualGroupHeading({ title, kind }: { title: string; kind: keyof typeof ACCENT }) {
  return (
    <div className="mt-6 flex items-center gap-2">
      <span className={cn('h-2 w-2 rounded-full', ACCENT[kind].dot)} aria-hidden="true" />
      <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-600">{title}</h3>
    </div>
  );
}

/**
 * What a growth figure was measured against, spelled out.
 *
 * A percentage with no stated basis is unreadable, and a month still running
 * must never look like a whole month — "Sen 1–23 vs Avg 1–23" says both.
 */
function growthBasis(growth: RevenueGrowth['monthly']): string {
  const span = growth.throughDay === null ? '' : ` 1–${growth.throughDay}`;
  return `${growth.monthLabel}${span} vs ${growth.previousMonthLabel}${span}`;
}

function growthValue(changePct: number | null, currentUzs: string, previousUzs: string) {
  if (changePct !== null) return formatPercent(changePct, 1);
  if (BigInt(previousUzs) === 0n && BigInt(currentUzs) > 0n) {
    return `0 → ${formatMoney(currentUzs)}`;
  }
  return '—';
}

function missingGrowthHelper(label: string, currentUzs: string, previousUzs: string) {
  if (BigInt(previousUzs) === 0n && BigInt(currentUzs) > 0n) {
    return `${label} · oldingi davr 0 so‘m, foiz hisoblanmaydi`;
  }
  return `${label} — ma’lumot mavjud emas`;
}

export function AnnualRevenueTiles({
  data,
  growth,
}: {
  data: AnnualRevenue;
  growth: RevenueGrowth;
}) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Yillik umumiy tushum"
        value={formatMoney(data.totalActualUzs)}
        helper={`Reja ${formatMoney(data.totalPlanUzs)} · bajarilish ${formatPercent(data.completionPct)}`}
        tone="revenue"
      />
      <Tile
        label="Yillik o‘rtacha tushum"
        value={formatMoney(data.averageMonthlyUzs)}
        helper={
          data.averageMonthsCount
            ? `Tushum bo‘lgan ${data.averageMonthsCount} oy bo‘yicha`
            : 'Tushum kiritilgan oy yo‘q'
        }
        tone="revenue"
      />
      <Tile
        label="Eng yuqori oylik tushum"
        value={data.peakMonth ? formatMoney(data.peakMonth.actualUzs) : '—'}
        helper={data.peakMonth ? `${data.peakMonth.label} ${data.year}` : 'Ma’lumot yo‘q'}
        tone="revenue"
      />
      <Tile
        label="Tushum o‘sishi (oylik)"
        value={growthValue(
          growth.monthly.changePct,
          growth.monthly.currentUzs,
          growth.monthly.previousUzs,
        )}
        helper={
          growth.monthly.changePct === null
            ? missingGrowthHelper(
                growthBasis(growth.monthly),
                growth.monthly.currentUzs,
                growth.monthly.previousUzs,
              )
            : `${growthBasis(growth.monthly)} · ${formatMoney(growth.monthly.previousUzs)}`
        }
        tone={
          growth.monthly.changePct === null
            ? 'neutral'
            : growth.monthly.changePct < 0
              ? 'loss'
              : 'revenue'
        }
      />
      <Tile
        label="Tushum o‘sishi (yillik)"
        value={growthValue(
          growth.annual.changePct,
          growth.annual.currentUzs,
          growth.annual.previousUzs,
        )}
        helper={
          growth.annual.changePct === null
            ? missingGrowthHelper(
                `${growth.annual.year} vs ${growth.annual.previousYear}`,
                growth.annual.currentUzs,
                growth.annual.previousUzs,
              )
            : `${growth.annual.year} vs ${growth.annual.previousYear} · ${formatMoney(growth.annual.previousUzs)}`
        }
        tone={
          growth.annual.changePct === null
            ? 'neutral'
            : growth.annual.changePct < 0
              ? 'loss'
              : 'revenue'
        }
      />
    </div>
  );
}

export function AnnualNetProfitTiles({ data }: { data: AnnualNetProfit }) {
  const total = BigInt(data.totalNetProfitUzs);
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Yillik sof foyda"
        value={formatMoney(data.totalNetProfitUzs)}
        helper="Daromaddan xarajatlar ayrilgandan keyingi natija"
        tone={total >= 0n ? 'profit' : 'loss'}
      />
      <Tile
        label="Foyda marjasi"
        value={data.netMarginPct === null ? '—' : formatPercent(data.netMarginPct)}
        helper={
          data.netMarginPct === null
            ? 'Tushum bo‘lmagani uchun hisoblanmadi'
            : 'Tushumning sof foyda sifatida qolgan ulushi'
        }
        tone={data.netMarginPct !== null && data.netMarginPct < 0 ? 'loss' : 'profit'}
      />
      <Tile
        label="Eng yuqori foyda oyi"
        value={data.bestMonth ? formatMoney(data.bestMonth.netProfitUzs) : '—'}
        helper={data.bestMonth ? `${data.bestMonth.label} ${data.year}` : 'Ma’lumot yo‘q'}
        tone="profit"
      />
      <Tile
        label="Eng past foyda oyi"
        value={data.worstMonth ? formatMoney(data.worstMonth.netProfitUzs) : '—'}
        helper={data.worstMonth ? `${data.worstMonth.label} ${data.year}` : 'Ma’lumot yo‘q'}
        tone={data.worstMonth && BigInt(data.worstMonth.netProfitUzs) < 0n ? 'loss' : 'profit'}
      />
    </div>
  );
}

/**
 * The chain in one card: what came in, what went out, what is left.
 *
 * The bars are scaled against revenue rather than each against itself, so the
 * relative size is the message — a thin expense bar beside a full revenue bar
 * says more than two full bars with different numbers under them.
 */
export function AnnualFinancialOverview({
  revenue,
  expense,
  netProfit,
}: {
  revenue: AnnualRevenue;
  expense: AnnualExpenseSummary;
  netProfit: AnnualNetProfit;
}) {
  const revenueUzs = BigInt(revenue.totalActualUzs);
  const expenseUzs = BigInt(expense.totalActualUzs);
  const netUzs = BigInt(netProfit.totalNetProfitUzs);

  // Everything is measured against the largest of the three, so a loss-making
  // year (expense above revenue) still renders inside the track.
  const scale = [revenueUzs, expenseUzs, netUzs < 0n ? -netUzs : netUzs].reduce(
    (largest, value) => (value > largest ? value : largest),
    0n,
  );
  const width = (value: bigint) => {
    if (scale === 0n) return 0;
    const magnitude = value < 0n ? -value : value;
    return Number((magnitude * 1000n) / scale) / 10;
  };

  const rows = [
    { key: 'revenue' as const, label: 'Tushum', value: revenueUzs, raw: revenue.totalActualUzs },
    { key: 'expense' as const, label: 'Xarajat', value: expenseUzs, raw: expense.totalActualUzs },
    {
      key: 'profit' as const,
      label: 'Sof foyda',
      value: netUzs,
      raw: netProfit.totalNetProfitUzs,
    },
  ];

  return (
    <div className="mt-4 rounded-card border border-border bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-ink">Yillik moliyaviy ko‘rsatkichlar</h3>
      <p className="mt-0.5 text-xs text-muted">
        Tushum − Xarajat = Sof foyda. Ustunlar eng katta ko‘rsatkichga nisbatan o‘lchangan.
      </p>

      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.key} className="rounded-xl border border-border/70 bg-slate-50/60 p-4">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span
                className={cn('h-2 w-2 rounded-full', ACCENT[row.key].dot)}
                aria-hidden="true"
              />
              {row.label}
            </dt>
            <dd
              className={cn(
                'mt-2 text-lg font-bold tabular-nums',
                row.key === 'profit' && row.value < 0n ? 'text-danger' : ACCENT[row.key].text,
              )}
            >
              {formatMoney(row.raw)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-4 text-xs">
              <span className="font-semibold text-slate-600">{row.label}</span>
              <span className="tabular-nums text-muted">{formatMoney(row.raw)}</span>
            </div>
            <div
              className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={`${row.label}: ${formatMoney(row.raw)}`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500',
                  row.key === 'profit' && row.value < 0n ? 'bg-danger' : ACCENT[row.key].bar,
                )}
                style={{ width: `${width(row.value)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
