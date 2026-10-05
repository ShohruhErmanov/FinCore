import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { cn } from '@/shared/lib/cn';
import { formatMoney, formatMoneyCompact, formatPercent, toChartNumber } from '@/shared/lib/format';
import type { MoneyUzs, RevenuePlanYear } from '@/shared/types/domain';
import { Card, ErrorState, KpiCard, LoadingState } from '@/shared/ui';

/**
 * Every month's revenue plan for the year on one screen, under the monthly
 * board where those plans are entered.
 *
 * The board answers "what is this month's plan"; this answers "what have I
 * planned for the year, and how is it going" without stepping through twelve
 * months in the app bar. A month name opens that month in the board above.
 *
 * The top-bar branch filter narrows it the same way it narrows the board:
 * "Barcha filiallar" shows each branch's plan as a column, one branch shows
 * that branch alone. Nothing is summed here — every figure is the server's.
 */
export function RevenuePlanYearOverview({
  year,
  branchId,
  selectedPeriodId,
  onSelectPeriod,
}: {
  year: number;
  /** 'all' or a branch id, as in the app bar. */
  branchId: string;
  selectedPeriodId: string;
  onSelectPeriod: (periodId: string) => void;
}) {
  const query = useQuery({
    queryKey: queryKeys.revenuePlanYear(year),
    queryFn: ({ signal }) => revenueApi.planYear(year, signal),
  });

  if (query.isLoading) return <LoadingState label="Yillik reja yuklanmoqda…" />;
  if (query.isError || !query.data)
    return (
      <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    );

  const view = viewFor(query.data, branchId);

  return (
    <Card
      title={`${year}-yil tushum rejasi · barcha oylar`}
      description={
        view.branchName
          ? `${view.branchName}: har oy kiritilgan reja va amaldagi tushum`
          : 'Har oy kiritilgan reja va amaldagi tushum, filiallar kesimida'
      }
      className="mt-5"
    >
      <section
        aria-label="Yillik reja ko‘rsatkichlari"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Yillik reja"
          value={formatMoney(view.plannedUzs)}
          helper={
            view.plannedMonths === 0
              ? 'Hali birorta oyga reja kiritilmagan'
              : `${view.plannedMonths} oyga reja kiritilgan`
          }
          tone="info"
        />
        <KpiCard
          label="Amalda"
          value={formatMoney(view.actualUzs)}
          helper={
            view.actualUzs === view.againstPlanUzs
              ? 'Yil davomidagi jami tushum'
              : `Rejali oylarda: ${formatMoney(view.againstPlanUzs)}`
          }
        />
        <KpiCard
          label="Bajarilish"
          value={formatPercent(view.completionPercent)}
          helper={remainderText(view.plannedUzs, view.againstPlanUzs, view.plannedMonths)}
          tone={completionTone(view.completionPercent)}
        />
        <KpiCard
          label="Reja kiritilgan oylar"
          value={`${view.plannedMonths} / 12`}
          helper={
            view.plannedMonths === 12
              ? 'Yilning barcha oylari rejalashtirilgan'
              : `${12 - view.plannedMonths} oyda reja yo‘q`
          }
          tone={view.plannedMonths === 12 ? 'success' : 'neutral'}
        />
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.45fr)] xl:items-start">
        <div className="rounded-xl border border-border/80 bg-white p-4 xl:sticky xl:top-24">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Oylar bo‘yicha reja va amalda
            </p>
            <div className="flex gap-4 text-xs font-medium text-slate-600" aria-hidden="true">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Reja
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Amalda
              </span>
            </div>
          </div>
          {/* The table beside it carries the same figures, so the chart is
              decorative for screen readers. */}
          <div className="mt-3 h-72 w-full xl:h-[34rem]" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={view.rows.map((row) => ({
                  name: row.label,
                  plan: row.plannedUzs === null ? 0 : toChartNumber(row.plannedUzs),
                  actual: toChartNumber(row.actualUzs),
                }))}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                barGap={2}
              >
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickFormatter={(value: number) => formatMoneyCompact(String(Math.trunc(value)))}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                  formatter={(value, name) => [
                    formatMoney(String(Math.trunc(Number(value)))),
                    name === 'plan' ? 'Reja' : 'Amalda',
                  ]}
                />
                <Bar
                  dataKey="plan"
                  name="plan"
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="actual"
                  name="actual"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">{year}-yil oylar bo‘yicha tushum rejasi</caption>
              <thead>
                <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-4 py-2.5">Oy</th>
                  {view.branchColumns.map((column) => (
                    <th key={column.branchId} className="px-4 py-2.5 text-right">
                      {column.branchName}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right">
                    {view.branchColumns.length ? 'Jami reja' : 'Reja'}
                  </th>
                  <th className="px-4 py-2.5 text-right">Amalda</th>
                  <th className="px-4 py-2.5 text-right">Bajarilish</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => {
                  const selected = row.periodId !== null && row.periodId === selectedPeriodId;
                  return (
                    <tr
                      key={row.month}
                      aria-current={selected ? 'true' : undefined}
                      className={cn(
                        'border-b border-border/70 last:border-0',
                        selected && 'bg-blue-50/70',
                      )}
                    >
                      <th scope="row" className="px-4 py-2 font-semibold text-ink">
                        {row.periodId && !selected ? (
                          <button
                            type="button"
                            onClick={() => onSelectPeriod(row.periodId!)}
                            className="rounded text-left text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2"
                            title={`${row.label} oyi rejasini yuqorida ochish`}
                          >
                            {row.label}
                          </button>
                        ) : (
                          row.label
                        )}
                      </th>
                      {row.branchPlans.map((amount, index) => (
                        <td
                          key={view.branchColumns[index]!.branchId}
                          className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-700"
                        >
                          <Amount value={amount} />
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums text-ink">
                        <Amount value={row.plannedUzs} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-700">
                        <Amount value={row.actualUzs} muteZero />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Completion value={row.completionPercent} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-slate-50 font-bold text-ink">
                  <th scope="row" className="px-4 py-2.5">
                    Jami
                  </th>
                  {view.branchColumns.map((column) => (
                    <td
                      key={column.branchId}
                      className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums"
                    >
                      {formatMoney(column.plannedUzs)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(view.plannedUzs)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(view.actualUzs)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Completion value={view.completionPercent} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-border/70 px-4 py-2.5 text-xs text-muted">
            Bajarilish faqat rejasi kiritilgan filiallar tushumi bo‘yicha hisoblanadi; rejasi yo‘q
            oy “—” bilan ko‘rsatiladi. Oy nomini bossangiz, o‘sha oy rejasi yuqorida ochiladi.
          </p>
        </div>
      </div>
    </Card>
  );
}

interface ViewRow {
  month: number;
  label: string;
  periodId: string | null;
  branchPlans: Array<MoneyUzs | null>;
  plannedUzs: MoneyUzs | null;
  actualUzs: MoneyUzs;
  completionPercent: number | null;
}

/**
 * Picks the slice the app bar asks for. For one branch it reads that branch's
 * own cells and totals — still the server's figures, never re-added here.
 */
function viewFor(data: RevenuePlanYear, branchId: string) {
  const branch =
    branchId === 'all' ? undefined : data.branches.find((item) => item.branchId === branchId);

  if (!branch)
    return {
      branchName: null,
      branchColumns: data.branches.map((item) => ({
        branchId: item.branchId,
        branchName: item.branchName,
        plannedUzs: item.plannedAmountUzs,
      })),
      plannedUzs: data.plannedAmountUzs,
      actualUzs: data.actualAmountUzs,
      againstPlanUzs: data.actualAgainstPlanUzs,
      completionPercent: data.completionPercent,
      plannedMonths: data.plannedMonths,
      rows: data.months.map(
        (month): ViewRow => ({
          month: month.month,
          label: month.label,
          periodId: month.periodId,
          branchPlans: data.branches.map(
            (item) =>
              month.branches.find((cell) => cell.branchId === item.branchId)?.plannedAmountUzs ??
              null,
          ),
          plannedUzs: month.plannedAmountUzs,
          actualUzs: month.actualAmountUzs,
          completionPercent: month.completionPercent,
        }),
      ),
    };

  return {
    branchName: branch.branchName,
    branchColumns: [],
    plannedUzs: branch.plannedAmountUzs,
    actualUzs: branch.actualAmountUzs,
    againstPlanUzs: branch.actualAgainstPlanUzs,
    completionPercent: branch.completionPercent,
    plannedMonths: branch.plannedMonths,
    rows: data.months.map((month): ViewRow => {
      const cell = month.branches.find((item) => item.branchId === branch.branchId);
      return {
        month: month.month,
        label: month.label,
        periodId: month.periodId,
        branchPlans: [],
        plannedUzs: cell?.plannedAmountUzs ?? null,
        actualUzs: cell?.actualAmountUzs ?? '0',
        completionPercent: cell?.completionPercent ?? null,
      };
    }),
  };
}

function remainderText(plannedUzs: MoneyUzs, againstPlanUzs: MoneyUzs, plannedMonths: number) {
  if (plannedMonths === 0) return 'Reja kiritilgach hisoblanadi';
  const left = BigInt(plannedUzs) - BigInt(againstPlanUzs);
  if (left > 0n) return `Rejagacha yana ${formatMoney(left.toString())}`;
  if (left < 0n) return `Reja ${formatMoney((-left).toString())}ga oshirib bajarildi`;
  return 'Reja to‘liq bajarildi';
}

function completionTone(value: number | null) {
  if (value === null) return 'neutral' as const;
  if (value >= 100) return 'success' as const;
  return 'warning' as const;
}

function Amount({ value, muteZero = false }: { value: MoneyUzs | null; muteZero?: boolean }) {
  if (value === null) return <span className="text-slate-300">—</span>;
  return (
    <span className={cn(muteZero && value === '0' && 'text-slate-300')}>{formatMoney(value)}</span>
  );
}

function Completion({ value }: { value: number | null }) {
  if (value === null) return <span className="text-sm text-slate-300">—</span>;
  const width = Math.max(0, Math.min(100, value));
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span
        className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block"
        aria-hidden="true"
      >
        <span
          className={cn(
            'block h-full rounded-full',
            value >= 100 ? 'bg-emerald-500' : value >= 80 ? 'bg-blue-500' : 'bg-amber-500',
          )}
          style={{ width: `${width}%` }}
        />
      </span>
      <span
        className={cn(
          'w-16 text-right font-semibold tabular-nums',
          value >= 100 ? 'text-emerald-700' : 'text-ink',
        )}
      >
        {formatPercent(value)}
      </span>
    </span>
  );
}
