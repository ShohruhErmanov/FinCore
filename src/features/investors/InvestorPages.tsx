import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { investorApi, payoutApi } from '@/shared/api/contracts';
import { routes } from '@/shared/config/routes';
import { formatMoney, formatPercent, formatShare } from '@/shared/lib/format';
import type {
  PayoutListItem,
  PayoutRequestRow,
  InvestorPaymentRow,
  PayoutSummary,
} from '@/shared/types/domain';
import {
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/shared/ui';
import { InvestorShareView } from './share-view';
import { useSelectedPeriod } from './use-selected-period';

const REQUEST_STATUS_LABEL: Record<PayoutRequestRow['status'], string> = {
  pending: 'Kutilmoqda',
  approved: 'Tasdiqlangan',
  paid: 'To‘langan',
  rejected: 'Rad etilgan',
  cancelled: 'Qaytarib olingan',
};

export function InvestorListPage() {
  const { year } = useSelectedPeriod();

  // The share, not the hand-recorded entitlement: this list and the detail
  // page it links to have to agree, and the detail page shows the share.
  const query = useQuery({
    queryKey: ['investor-payouts', 'list', year],
    queryFn: ({ signal }) => payoutApi.list(year, signal),
  });

  if (query.isLoading) return <LoadingState label="Investorlar yuklanmoqda…" />;
  if (query.isError) return <ErrorState message="Investorlar ro‘yxatini olib bo‘lmadi." />;

  const rows = query.data ?? [];
  const capitalTotals = rows.reduce(
    (totals, row) => {
      const capital = row.capitalContribution;
      if (!capital) return totals;
      const amount = BigInt(capital.amountUzs);
      totals.total += amount;
      if (capital.paymentMethod.code === 'CASH') totals.cash += amount;
      if (capital.paymentMethod.code === 'CARD') totals.card += amount;
      if (capital.paymentMethod.code === 'BANK_TRANSFER') totals.bank += amount;
      return totals;
    },
    { cash: 0n, card: 0n, bank: 0n, total: 0n },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investorlar"
        description={`${year}-yil fakt tushumidan hisoblangan ulush va to‘lov holati.`}
      />

      <section aria-label="Investor kapitali to‘lov shakli bo‘yicha" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Jami investor kapitali"
          value={formatMoney(String(capitalTotals.total))}
          helper="Payoutlardan alohida"
        />
        <KpiCard label="Naqd" value={formatMoney(String(capitalTotals.cash))} helper="Kiritilgan kapital" />
        <KpiCard label="Plastik / Karta" value={formatMoney(String(capitalTotals.card))} helper="Kiritilgan kapital" />
        <KpiCard label="Bank o‘tkazmasi" value={formatMoney(String(capitalTotals.bank))} helper="Kiritilgan kapital" />
      </section>

      {rows.length === 0 ? (
        <EmptyState
          title="Investor qayd etilmagan"
          description="Investor qo‘shilgach, uning ulushi va hisob-kitobi shu yerda ko‘rinadi."
        />
      ) : (
        <Card>
          <DataTable<PayoutListItem>
            caption={`${year}-yil investorlari`}
            rows={rows}
            columns={[
              {
                key: 'fullName',
                header: 'Investor',
                cell: (row) => (
                  <Link
                    className="font-semibold text-primary hover:underline"
                    to={routes.investorDetail(row.id)}
                  >
                    {row.fullName}
                  </Link>
                ),
              },
              { key: 'phone', header: 'Telefon', cell: (row) => row.phone ?? '—' },
              {
                key: 'branch',
                header: 'Filial',
                cell: (row) => row.branch?.name ?? 'Butun kompaniya',
              },
              {
                key: 'ownership',
                header: 'Ulush',
                className: 'text-right tabular-nums font-semibold',
                cell: (row) => formatPercent(row.ownershipPercent, 2),
              },
              {
                key: 'capital',
                header: 'Kiritilgan kapital',
                className: 'text-right tabular-nums',
                cell: (row) =>
                  row.capitalContribution
                    ? formatMoney(row.capitalContribution.amountUzs)
                    : 'Qayd etilmagan',
              },
              {
                key: 'fact',
                header: 'Fakt tushum',
                className: 'text-right tabular-nums',
                cell: (row) => formatMoney(row.annual.factRevenueUzs),
              },
              {
                key: 'share',
                header: 'Tegishli',
                className: 'text-right tabular-nums',
                cell: (row) => formatShare(row.annual.shareUzs),
              },
              {
                key: 'paid',
                header: 'To‘langan',
                className: 'text-right tabular-nums',
                cell: (row) => formatShare(row.annual.paidUzs),
              },
              {
                key: 'remaining',
                header: 'Qolgan',
                className: 'text-right tabular-nums',
                cell: (row) => formatShare(row.annual.remainingUzs),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

/**
 * One investor, as the director sees them.
 *
 * The headline is the same InvestorShareView the investor's own page renders,
 * so neither role can be looking at a different figure from the other. What is
 * added here is the director's material: the requests raised against the share,
 * the payment ledger, and the separate figure a director may record by hand.
 */
export function InvestorDetailPage({ investorId }: { investorId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const id = investorId ?? params.id ?? '';
  const { year, month } = useSelectedPeriod();

  const shareQuery = useQuery({
    queryKey: ['investor-payouts', 'investor', id, year],
    queryFn: ({ signal }) => payoutApi.summary(id, year, signal),
    enabled: Boolean(id),
  });

  // The 014 ledger: the payments themselves, and the amount a director may have
  // recorded by hand. Separate call, because it answers a separate question.
  const recordedQuery = useQuery({
    queryKey: ['investor', id, year],
    queryFn: ({ signal }) => investorApi.dashboard(id, year, signal),
    enabled: Boolean(id),
  });

  if (shareQuery.isLoading) return <LoadingState label="Investor ma’lumoti yuklanmoqda…" />;
  if (shareQuery.isError)
    return <ErrorState message="Investor ma’lumotini olib bo‘lmadi yoki ruxsat yo‘q." />;

  const data: PayoutSummary | undefined = shareQuery.data;
  if (!data) return <EmptyState description="Investor ma’lumoti topilmadi." />;

  const requests = data.months.flatMap((row) => row.requests);
  const payments = recordedQuery.data?.payments ?? [];
  const recorded = recordedQuery.data?.annual;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.investor.fullName}
        description={`${data.investor.phone ?? 'Telefon kiritilmagan'} · ${
          data.investor.branch?.name ?? 'Butun kompaniya'
        }`}
        badge={<StatusBadge status={data.investor.isActive ? 'active' : 'inactive'} />}
      />

      <InvestorShareView summary={data} year={year} month={month} />

      <Card
        title="To‘lov so‘rovlari"
        description="Investor shu ulush bo‘yicha yuborgan so‘rovlar."
      >
        {requests.length === 0 ? (
          <EmptyState description="Bu yil uchun to‘lov so‘rovi yuborilmagan." />
        ) : (
          <DataTable<PayoutRequestRow>
            caption={`${year}-yil to‘lov so‘rovlari`}
            rows={requests}
            columns={[
              { key: 'period', header: 'Davr', cell: (row) => `${row.monthLabel} ${row.year}` },
              {
                key: 'amount',
                header: 'So‘ralgan',
                className: 'text-right tabular-nums',
                cell: (row) => formatMoney(row.requestedAmountUzs),
              },
              {
                key: 'share',
                header: 'O‘shandagi ulush',
                className: 'text-right tabular-nums',
                cell: (row) => formatShare(row.calculatedShareUzs),
              },
              { key: 'status', header: 'Holat', cell: (row) => REQUEST_STATUS_LABEL[row.status] },
              {
                key: 'decision',
                header: 'Qaror',
                cell: (row) => row.decisionNote ?? row.decidedByName ?? '—',
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="To‘lovlar tarixi"
        description="Bekor qilingan yozuv o‘chirilmaydi — tarix uchun ko‘rinib turadi"
      >
        {payments.length === 0 ? (
          <EmptyState description="Bu yil uchun to‘lov qayd etilmagan." />
        ) : (
          <DataTable<InvestorPaymentRow>
            caption={`${year}-yil to‘lovlari`}
            rows={payments}
            columns={[
              { key: 'paidOn', header: 'Sana', cell: (row) => row.paidOn },
              {
                key: 'amount',
                header: 'Summa',
                className: 'text-right tabular-nums',
                cell: (row) => (
                  <span className={row.status === 'reversed' ? 'text-muted line-through' : ''}>
                    {formatMoney(row.amountUzs)}
                  </span>
                ),
              },
              {
                // StatusBadge covers account and period states only; a payment
                // state is its own vocabulary, so it renders its own chip.
                key: 'status',
                header: 'Holat',
                cell: (row) => (
                  <span
                    className={
                      row.status === 'reversed'
                        ? 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'
                        : 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700'
                    }
                  >
                    {row.status === 'reversed' ? 'Bekor qilingan' : 'To‘langan'}
                  </span>
                ),
              },
              {
                key: 'note',
                header: 'Izoh',
                cell: (row) => row.reversalReason ?? row.note ?? '—',
              },
            ]}
          />
        )}
      </Card>

      {recorded && recorded.entitledAmountUzs !== '0' ? (
        <Card
          title="Qo‘lda qayd etilgan summa"
          description="Fakt tushumdan hisoblangan ulushdan alohida — direktor kiritgan yillik summa."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Qayd etilgan"
              value={formatMoney(recorded.entitledAmountUzs)}
              helper={`${year}-yil bo‘yicha`}
            />
            <KpiCard
              label="Olingan"
              value={formatMoney(recorded.paidAmountUzs)}
              helper={formatPercent(recorded.paidPercent, 1)}
            />
            <KpiCard
              label="Qolgan"
              value={formatMoney(recorded.remainingAmountUzs)}
              helper={formatPercent(recorded.remainingPercent, 1)}
              tone={recorded.remainingAmountUzs === '0' ? 'success' : 'warning'}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
