import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import { authApi, payoutApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime, formatMoney, formatPercent, formatShare } from '@/shared/lib/format';
import type { PayoutRequestRow } from '@/shared/types/domain';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  KpiCard,
  LoadingState,
  Modal,
  PageHeader,
  Textarea,
  useToast,
} from '@/shared/ui';
import { errorMessage } from './payout-errors';
import { PayoutStatusBadge } from './payout-status-badge';

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
    queryKey: queryKeys.investorPayoutQueue,
    queryFn: ({ signal }) => payoutApi.queue(signal),
  });

  const canApprove = Boolean(meQuery.data?.permissions.includes('investor.settlement.approve'));
  const canPay = Boolean(meQuery.data?.permissions.includes('investor.settlement.pay'));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.investorPayoutsRoot });
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
              className="neu-inset h-11 w-full rounded-xl border border-border/70 px-3 text-sm"
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
