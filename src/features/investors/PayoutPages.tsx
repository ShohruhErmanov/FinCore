import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Ban, CircleSlash, Clock, HandCoins, Send } from 'lucide-react';
import { authApi, investorApi, payoutApi } from '@/shared/api/contracts';
import { ApiError } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime, formatMoney, formatPercent, formatShare } from '@/shared/lib/format';
import type { PayoutRequestRow, PayoutStatus, PayoutSummary } from '@/shared/types/domain';
import {
  Alert,
  Button,
  Card,
  CurrencyInput,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  KpiCard,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
  Textarea,
  useToast,
} from '@/shared/ui';
import { InvestorShareView } from './share-view';
import { useSelectedPeriod } from './use-selected-period';

const STATUS_META: Record<PayoutStatus, { label: string; className: string; icon: JSX.Element }> = {
  pending: {
    label: 'Kutilmoqda',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: <Clock />,
  },
  approved: {
    label: 'Tasdiqlangan',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    icon: <BadgeCheck />,
  },
  paid: {
    label: 'To‘langan',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: <HandCoins />,
  },
  rejected: {
    label: 'Rad etilgan',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: <Ban />,
  },
  cancelled: {
    label: 'Qaytarib olingan',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: <CircleSlash />,
  },
};

/**
 * A badge of its own rather than widening the shared StatusBadge: payout states
 * are not period states, and collapsing the two vocabularies would make
 * "Ochiq" mean two different things on two different screens.
 */
function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm [&_svg]:h-3.5 [&_svg]:w-3.5 ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

/** Turns an API refusal into the sentence the server actually sent. */
function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Amalni bajarib bo‘lmadi. Qayta urinib ko‘ring.';
}

// ---------------------------------------------------------------- investor

export function MySharePage() {
  const { year, month, periodId } = useSelectedPeriod();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const query = useQuery({
    queryKey: ['investor-payouts', 'me', year],
    queryFn: ({ signal }) => payoutApi.mine(year, signal),
  });

  const data: PayoutSummary | undefined = query.data;

  const entitlementQuery = useQuery({
    queryKey: ['investor', data?.investor.id, year],
    queryFn: ({ signal }) => investorApi.dashboard(data!.investor.id, year, signal),
    enabled: Boolean(data?.investor.id),
  });
  const recorded = entitlementQuery.data?.annual;
  // The app bar names one month; that is the month a request is raised for.
  const focus = useMemo(
    () => (month === null ? null : data?.months.find((row) => row.month === month)),
    [data, month],
  );

  const requestMutation = useMutation({
    mutationFn: () =>
      payoutApi.request({
        periodId: periodId!,
        amountUzs: amount.replace(/\D/g, ''),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: async () => {
      setAmount('');
      setNote('');
      notify({ tone: 'success', title: 'So‘rov yuborildi', message: 'Direktor ko‘rib chiqadi.' });
      await queryClient.invalidateQueries({ queryKey: ['investor-payouts'] });
    },
    onError: (error: unknown) =>
      notify({ tone: 'danger', title: 'So‘rov yuborilmadi', message: errorMessage(error) }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => payoutApi.cancel(id),
    onSuccess: async () => {
      notify({ tone: 'info', title: 'So‘rov qaytarib olindi' });
      await queryClient.invalidateQueries({ queryKey: ['investor-payouts'] });
    },
    onError: (error: unknown) =>
      notify({ tone: 'danger', title: 'Bekor qilinmadi', message: errorMessage(error) }),
  });

  if (query.isLoading) return <LoadingState label="Ulush hisoblanmoqda" />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  if (!data) return <EmptyState description="Sizga biriktirilgan investor profili yo‘q." />;

  const requests = data.months.flatMap((row) => row.requests);
  const digits = amount.replace(/\D/g, '');
  const requested = digits ? BigInt(digits) : 0n;
  const ceiling = focus ? BigInt(focus.payableUzs) : 0n;
  const tooMuch = requested > ceiling;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.investor.fullName}
        badge={<StatusBadge status={data.investor.isActive ? 'active' : 'inactive'} />}
        description={`${data.investor.phone ?? '—'} · ${
          data.investor.branch ? data.investor.branch.name : 'Butun kompaniya'
        }`}
      />

      <InvestorShareView summary={data} year={year} month={month} />

      <Card
        title={focus ? `${focus.label} ${year} — to‘lov so‘rovi` : 'To‘lov so‘rovi'}
        {...(focus
          ? {
              description: `Shu oy uchun eng ko‘pi ${formatMoney(focus.payableUzs)} so‘ralishi mumkin.`,
            }
          : {})}
      >
        {!focus ? (
          <EmptyState description="So‘rov yuborish uchun tepadagi paneldan oyni tanlang." />
        ) : focus.isSettled ? (
          <Alert tone="info" title="Bu oy yopilgan">
            {`Hisoblangan ulush ${formatShare(focus.shareUzs)}, to‘langan ${formatShare(focus.paidUzs)}. So‘raladigan summa qolmagan.`}
          </Alert>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!tooMuch && requested > 0n) requestMutation.mutate();
            }}
          >
            <FormField
              label="So‘raladigan summa"
              htmlFor="payout-amount"
              required
              hint={`Qolgan: ${formatShare(focus.remainingUzs)}`}
              {...(tooMuch
                ? { error: `Eng ko‘pi ${formatMoney(focus.payableUzs)} so‘ralishi mumkin.` }
                : {})}
            >
              <CurrencyInput
                id="payout-amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </FormField>
            <FormField label="Izoh" htmlFor="payout-note" hint="Majburiy emas">
              <Textarea
                id="payout-note"
                rows={2}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={tooMuch || requested <= 0n || requestMutation.isPending}
              >
                <Send />
                {requestMutation.isPending ? 'Yuborilmoqda…' : 'So‘rov yuborish'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card title="So‘rovlar tarixi">
        {requests.length === 0 ? (
          <EmptyState description="Hali to‘lov so‘rovi yuborilmagan." />
        ) : (
          <DataTable
            caption="Yuborilgan to‘lov so‘rovlari"
            rows={requests}
            columns={[
              {
                key: 'period',
                header: 'Davr',
                cell: (row) => `${row.monthLabel} ${row.year}`,
              },
              {
                key: 'amount',
                header: 'So‘ralgan',
                cell: (row) => formatMoney(row.requestedAmountUzs),
                className: 'text-right',
              },
              {
                key: 'status',
                header: 'Holat',
                cell: (row) => <PayoutStatusBadge status={row.status} />,
              },
              {
                key: 'decision',
                header: 'Qaror',
                cell: (row) => row.decisionNote ?? (row.decidedByName ? row.decidedByName : '—'),
              },
              {
                key: 'created',
                header: 'Yuborilgan',
                cell: (row) => formatDateTime(row.createdAt),
              },
              {
                key: 'actions',
                header: '',
                cell: (row) =>
                  row.status === 'pending' || row.status === 'approved' ? (
                    <Button
                      variant="ghost"
                      onClick={() => cancelMutation.mutate(row.id)}
                      disabled={cancelMutation.isPending}
                    >
                      Qaytarib olish
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      {recorded && recorded.entitledAmountUzs !== '0' ? (
        <Card
          title="Direktor qayd etgan summa"
          description="Fakt tushumdan hisoblangan ulushdan alohida — direktor qo‘lda kiritgan yillik summa."
        >
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted">Tegishli</dt>
              <dd className="text-sm font-semibold text-ink">
                {formatMoney(recorded.entitledAmountUzs)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted">Olingan</dt>
              <dd className="text-sm font-semibold text-ink">
                {formatMoney(recorded.paidAmountUzs)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted">Qolgan</dt>
              <dd className="text-sm font-semibold text-ink">
                {formatMoney(recorded.remainingAmountUzs)}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- director

export function PayoutRequestsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [decision, setDecision] = useState<{ row: PayoutRequestRow; kind: 'rejected' } | null>(
    null,
  );
  const [payment, setPayment] = useState<PayoutRequestRow | null>(null);
  const [note, setNote] = useState('');
  const [paidOn, setPaidOn] = useState('');

  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });
  const query = useQuery({
    queryKey: ['investor-payouts', 'queue'],
    queryFn: ({ signal }) => payoutApi.queue(signal),
  });

  const canApprove = Boolean(meQuery.data?.permissions.includes('investor.settlement.approve'));
  const canPay = Boolean(meQuery.data?.permissions.includes('investor.settlement.pay'));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['investor-payouts'] });
  };

  const decideMutation = useMutation({
    mutationFn: (input: { id: string; kind: 'approved' | 'rejected'; note?: string }) =>
      payoutApi.decide(input.id, input.kind, input.note),
    onSuccess: async (_row, input) => {
      setDecision(null);
      setNote('');
      notify({
        tone: input.kind === 'approved' ? 'success' : 'info',
        title: input.kind === 'approved' ? 'So‘rov tasdiqlandi' : 'So‘rov rad etildi',
      });
      await refresh();
    },
    onError: (error: unknown) =>
      notify({ tone: 'danger', title: 'Qaror saqlanmadi', message: errorMessage(error) }),
  });

  const payMutation = useMutation({
    mutationFn: (input: { id: string; paidOn: string; note?: string }) =>
      payoutApi.markPaid(input.id, input.paidOn, input.note),
    onSuccess: async () => {
      setPayment(null);
      setPaidOn('');
      setNote('');
      notify({ tone: 'success', title: 'To‘lov qayd etildi' });
      await refresh();
    },
    onError: (error: unknown) =>
      notify({ tone: 'danger', title: 'To‘lov qayd etilmadi', message: errorMessage(error) }),
  });

  if (query.isLoading) return <LoadingState label="So‘rovlar yuklanmoqda" />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const rows = query.data ?? [];
  const pending = rows.filter((row) => row.status === 'pending');
  const approved = rows.filter((row) => row.status === 'approved');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investor to‘lov so‘rovlari"
        description="Fakt tushumdan hisoblangan ulush bo‘yicha so‘rovlarni tasdiqlash va to‘lash."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Qaror kutmoqda"
          value={String(pending.length)}
          helper="Direktor javobini kutayotgan so‘rovlar"
          tone="warning"
        />
        <KpiCard
          label="Tasdiqlangan, to‘lanmagan"
          value={String(approved.length)}
          helper="Tasdiqlangan, lekin pul hali o‘tkazilmagan"
          tone="neutral"
        />
        <KpiCard
          label="To‘lanishi kerak"
          value={formatMoney(
            approved.reduce((total, row) => total + BigInt(row.requestedAmountUzs), 0n).toString(),
          )}
          helper="Tasdiqlangan so‘rovlar yig‘indisi"
        />
      </div>

      <Card title="Navbat">
        {rows.length === 0 ? (
          <EmptyState description="Ko‘rib chiqilmagan so‘rov yo‘q." />
        ) : (
          <DataTable
            caption="Investor to‘lov so‘rovlari"
            rows={rows}
            columns={[
              { key: 'investor', header: 'Investor', cell: (row) => row.investorName },
              {
                key: 'period',
                header: 'Davr',
                cell: (row) => `${row.monthLabel} ${row.year}`,
              },
              {
                key: 'amount',
                header: 'So‘ralgan',
                cell: (row) => formatMoney(row.requestedAmountUzs),
                className: 'text-right',
              },
              {
                key: 'share',
                header: 'Hisoblangan ulush',
                // The snapshot, not today's figure: that is what the decision
                // was made against.
                cell: (row) => (
                  <span
                    title={`${formatPercent(row.ownershipPercent, 2)} — so‘rov paytidagi ulush`}
                  >
                    {formatShare(row.calculatedShareUzs)}
                  </span>
                ),
                className: 'text-right',
              },
              {
                key: 'status',
                header: 'Holat',
                cell: (row) => <PayoutStatusBadge status={row.status} />,
              },
              {
                key: 'created',
                header: 'Yuborilgan',
                cell: (row) => formatDateTime(row.createdAt),
              },
              {
                key: 'actions',
                header: '',
                cell: (row) => (
                  <div className="flex flex-wrap gap-2">
                    {row.status === 'pending' && canApprove && (
                      <>
                        <Button
                          onClick={() => decideMutation.mutate({ id: row.id, kind: 'approved' })}
                          disabled={decideMutation.isPending}
                        >
                          Tasdiqlash
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setNote('');
                            setDecision({ row, kind: 'rejected' });
                          }}
                        >
                          Rad etish
                        </Button>
                      </>
                    )}
                    {row.status === 'approved' && canPay && (
                      <Button
                        onClick={() => {
                          setNote('');
                          // The payment's period comes from its date, so it has
                          // to fall inside the requested month.
                          setPaidOn(
                            `${row.year}-${String(row.month).padStart(2, '0')}-${String(
                              new Date(row.year, row.month, 0).getDate(),
                            ).padStart(2, '0')}`,
                          );
                          setPayment(row);
                        }}
                      >
                        <HandCoins />
                        To‘lash
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title="So‘rovni rad etish"
        {...(decision
          ? {
              description: `${decision.row.investorName} — ${decision.row.monthLabel} ${decision.row.year}, ${formatMoney(decision.row.requestedAmountUzs)}`,
            }
          : {})}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Bekor qilish
            </Button>
            <Button
              disabled={note.trim().length < 3 || decideMutation.isPending}
              onClick={() =>
                decision &&
                decideMutation.mutate({ id: decision.row.id, kind: 'rejected', note: note.trim() })
              }
            >
              Rad etish
            </Button>
          </div>
        }
      >
        <FormField
          label="Sabab"
          htmlFor="reject-note"
          required
          hint="Investor shu matnni ko‘radi — kamida 3 belgi"
        >
          <Textarea
            id="reject-note"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
      </Modal>

      <Modal
        open={payment !== null}
        onClose={() => setPayment(null)}
        title="To‘lovni qayd etish"
        {...(payment
          ? {
              description: `${payment.investorName} — ${formatMoney(payment.requestedAmountUzs)}. Summa so‘rovdan olinadi va o‘zgartirilmaydi.`,
            }
          : {})}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayment(null)}>
              Bekor qilish
            </Button>
            <Button
              disabled={!paidOn || payMutation.isPending}
              onClick={() =>
                payment &&
                payMutation.mutate({
                  id: payment.id,
                  paidOn,
                  ...(note.trim() ? { note: note.trim() } : {}),
                })
              }
            >
              To‘landi deb belgilash
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <FormField
            label="To‘lov sanasi"
            htmlFor="paid-on"
            required
            {...(payment
              ? {
                  hint: `${payment.monthLabel} ${payment.year} ichida bo‘lishi kerak — davr shu sanadan aniqlanadi.`,
                }
              : {})}
          >
            <input
              id="paid-on"
              type="date"
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </FormField>
          <FormField label="Izoh" htmlFor="pay-note" hint="Majburiy emas">
            <Textarea
              id="pay-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
