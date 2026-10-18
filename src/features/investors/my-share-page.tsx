import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { investorApi, payoutApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime, formatMoney, formatShare } from '@/shared/lib/format';
import type { PayoutSummary } from '@/shared/types/domain';
import {
  Alert,
  Button,
  Card,
  CurrencyInput,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  PageHeader,
  StatusBadge,
  Textarea,
  useToast,
} from '@/shared/ui';
import { InvestorShareView } from './share-view';
import { useSelectedPeriod } from './use-selected-period';
import { errorMessage } from './payout-errors';
import { PayoutStatusBadge } from './payout-status-badge';

export function MySharePage() {
  const { year, month, periodId } = useSelectedPeriod();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const query = useQuery({
    queryKey: queryKeys.investorPayoutMe(year),
    queryFn: ({ signal }) => payoutApi.mine(year, signal),
  });

  const data: PayoutSummary | undefined = query.data;

  const entitlementQuery = useQuery({
    queryKey: queryKeys.investorDashboard(data?.investor.id, year),
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.investorPayoutsRoot });
    },
    onError: (error: unknown) =>
      notify({ tone: 'danger', title: 'So‘rov yuborilmadi', message: errorMessage(error) }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => payoutApi.cancel(id),
    onSuccess: async () => {
      notify({ tone: 'info', title: 'So‘rov qaytarib olindi' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.investorPayoutsRoot });
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
