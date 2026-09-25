import { useState } from 'react';
import { formatMoney, formatPercent, formatShare } from '@/shared/lib/format';
import type { PayoutAvailability, PayoutSummary } from '@/shared/types/domain';
import { Card, DataTable, KpiCard, Tabs } from '@/shared/ui';

type Scope = 'monthly' | 'annual';

/**
 * The investor's share of actual revenue, rendered the same way for both roles.
 *
 * Shared rather than written twice: an investor and the director deciding their
 * payout must be looking at the same number. Two copies of this markup is how
 * the two screens end up disagreeing after one of them is edited.
 *
 * Year and month come from the app bar. The Oylik/Yillik switch then chooses
 * which of the two the headline shows — a month the bar has named, or the whole
 * year. With no month named there is only one thing to show, so the switch
 * disappears rather than offering a choice that does nothing.
 */
export function InvestorShareView({
  summary,
  year,
  month,
}: {
  summary: PayoutSummary;
  year: number;
  month: number | null;
}) {
  const selected = month === null ? null : summary.months.find((row) => row.month === month);
  const [scope, setScope] = useState<Scope>('monthly');

  const showMonth = selected !== undefined && selected !== null && scope === 'monthly';
  const headline: PayoutAvailability & { factRevenueUzs: string } = showMonth
    ? selected
    : summary.annual;
  const label = showMonth ? `${selected.label} ${year}` : `${year}-yil`;
  const percent = formatPercent(summary.investor.ownershipPercent, 2);

  return (
    <>
      {selected ? (
        <Tabs
          label="Hisob davri"
          items={[
            {
              id: 'monthly',
              label: 'Oylik',
              selected: scope === 'monthly',
              onSelect: () => setScope('monthly'),
            },
            {
              id: 'annual',
              label: 'Yillik',
              selected: scope === 'annual',
              onSelect: () => setScope('annual'),
            },
          ]}
        />
      ) : null}

      <Card
        title="Investor kapitali"
        description="Kiritilgan kapital payout va foyda ulushidan alohida moliyaviy fakt."
      >
        {summary.investor.capitalContribution ? (
          <dl className="grid gap-4 sm:grid-cols-3">
            <CapitalFact
              label="Kiritilgan mablag‘"
              value={formatMoney(summary.investor.capitalContribution.amountUzs)}
            />
            <CapitalFact
              label="Qo‘shilgan oy"
              value={`${summary.investor.capitalContribution.startPeriod.label} ${summary.investor.capitalContribution.startPeriod.year}`}
            />
            <CapitalFact
              label="Pul shakli"
              value={summary.investor.capitalContribution.paymentMethod.name}
            />
          </dl>
        ) : (
          <p className="text-sm text-muted">
            Bu tarixiy investor uchun boshlang‘ich kapital va qo‘shilish oyi qayd etilmagan;
            mavjud hisob-kitob o‘zgartirilmagan.
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Ulush foizi"
          value={percent}
          helper="Kompaniyadagi ulush — olingan summa foizi emas"
        />
        <KpiCard
          label={`Fakt tushum · ${label}`}
          value={formatMoney(headline.factRevenueUzs)}
          helper="Bekor qilingan tranzaksiyalar hisobga olinmagan"
        />
        <KpiCard
          label={`Tegishli summa · ${label}`}
          value={formatShare(headline.shareUzs)}
          helper={`${formatMoney(headline.factRevenueUzs)} × ${percent}`}
        />
        <KpiCard
          label={`Qolgan · ${label}`}
          value={formatShare(headline.remainingUzs)}
          helper={`To‘langan: ${formatShare(headline.paidUzs)}`}
          tone={headline.isSettled ? 'success' : 'warning'}
        />
      </div>

      <Card
        title={`${label} — hisob-kitob`}
        {...(showMonth
          ? {}
          : {
              description:
                'Yillik ulush yil bo‘yicha fakt tushumdan bir marta hisoblanadi — oylik ustunning yig‘indisi emas.',
            })}
      >
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Row
            label={showMonth ? 'Shu oydagi fakt tushum' : 'Yillik fakt tushum'}
            value={formatMoney(headline.factRevenueUzs)}
            divider
          />
          <Row label="Ulush foizi" value={percent} divider />
          <Row label="Tegishli summa" value={formatShare(headline.shareUzs)} divider strong />
          <Row label="So‘ralgan, to‘lanmagan" value={formatShare(headline.openUzs)} divider />
          <Row label="To‘langan" value={formatShare(headline.paidUzs)} divider />
          <Row label="To‘lanishi mumkin" value={formatMoney(headline.payableUzs)} divider strong />
          <Row label="Qolgan" value={formatShare(headline.remainingUzs)} strong />
          <Row label="Qoldiq (bir so‘mdan kam)" value={formatShare(headline.residualUzs)} />
        </dl>
      </Card>

      <Card
        title={`${year}-yil oylar kesimida`}
        description="Har oyning fakt tushumi va undan hisoblangan ulush."
      >
        <DataTable
          caption="Oylar bo‘yicha fakt tushum, ulush va to‘lov holati"
          rows={summary.months.map((row) => ({ ...row, id: row.periodId }))}
          columns={[
            { key: 'month', header: 'Oy', cell: (row) => row.label },
            {
              key: 'fact',
              header: 'Fakt tushum',
              className: 'text-right tabular-nums',
              cell: (row) => formatMoney(row.factRevenueUzs),
            },
            {
              key: 'share',
              header: 'Tegishli',
              className: 'text-right tabular-nums',
              cell: (row) => formatShare(row.shareUzs),
            },
            {
              key: 'paid',
              header: 'To‘langan',
              className: 'text-right tabular-nums',
              cell: (row) => formatShare(row.paidUzs),
            },
            {
              key: 'open',
              header: 'So‘ralgan',
              className: 'text-right tabular-nums',
              cell: (row) => formatShare(row.openUzs),
            },
            {
              key: 'remaining',
              header: 'Qolgan',
              className: 'text-right tabular-nums',
              cell: (row) => formatShare(row.remainingUzs),
            },
          ]}
        />
      </Card>
    </>
  );
}

function CapitalFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-2 text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  divider = false,
  strong = false,
}: {
  label: string;
  value: string;
  divider?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${divider ? 'border-b border-border pb-2' : ''}`}
    >
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`text-sm tabular-nums text-ink ${strong ? 'font-bold' : 'font-semibold'}`}>
        {value}
      </dd>
    </div>
  );
}
