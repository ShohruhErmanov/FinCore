import { Download } from 'lucide-react';
import {
  AnnualFinancialOverview,
  AnnualGroupHeading,
  AnnualNetProfitTiles,
  AnnualRevenueTiles,
} from './annual-financials';
import { cn } from '@/shared/lib/cn';
import { downloadCsv } from '@/shared/lib/csv';
import { formatMoney } from '@/shared/lib/format';
import type {
  AnnualExpenseSummary,
  AnnualNetProfit,
  AnnualRevenue,
  RevenueGrowth,
} from '@/shared/types/domain';
import { Button, Card, MoneyText, PercentText, VarianceText } from '@/shared/ui';
import { percentOf } from './dashboard-format';
import { AnnualCompositionCharts } from './annual-composition-charts';

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

/** Excel «Xulosa» varag‘ining veb ko‘rinishi. */
export function AnnualSummary({
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
