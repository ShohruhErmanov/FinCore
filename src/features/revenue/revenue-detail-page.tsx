import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { invalidateRevenueAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDateTime } from '@/shared/lib/format';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  MoneyText,
  PageHeader,
  StatusBadge,
  Textarea,
  FormField,
} from '@/shared/ui';

export function RevenueDetailPage() {
  const { transactionId = '' } = useParams();
  const { hasPermission, canWriteBranch } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const transaction = useQuery({
    queryKey: queryKeys.revenueTransaction(transactionId),
    queryFn: ({ signal }) => revenueApi.transaction(transactionId, signal),
    enabled: transactionId.length > 0,
  });
  const reverse = useMutation({
    mutationFn: () => revenueApi.reverse(transactionId, reason.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.revenueTransaction(transactionId),
      });
      await invalidateRevenueAggregates(queryClient);
      setConfirming(false);
    },
  });
  const submitReverse = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length >= 8) reverse.mutate();
  };
  if (!transactionId) return <EmptyState title="Tranzaksiya ID topilmadi" />;
  if (transaction.isLoading) return <LoadingState label="Tushum tafsiloti yuklanmoqda…" />;
  if (transaction.isError)
    return (
      <ErrorState
        message={getApiErrorMessage(transaction.error)}
        onRetry={() => void transaction.refetch()}
      />
    );
  if (!transaction.data) return <EmptyState title="Tranzaksiya topilmadi" />;
  const item = transaction.data;
  const canReverse =
    hasPermission('revenue.reverse') && canWriteBranch(item.branchId) && item.status === 'posted';
  return (
    <>
      <div className="mb-3">
        <Link
          to={routes.revenueTransactions}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Tushum jurnaliga qaytish
        </Link>
      </div>
      <PageHeader
        title={`Kvitansiya #${item.receiptNo}`}
        description={formatDateTime(item.paymentAt)}
        badge={<StatusBadge status={item.status} />}
        actions={
          canReverse ? (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              <RotateCcw className="h-4 w-4" />
              Bekor qilish
            </Button>
          ) : undefined
        }
      />
      {item.status === 'reversed' ? (
        <Alert title="Bekor qilingan tushum" tone="danger" className="mb-5">
          Original yozuv audit uchun saqlangan. Sabab: {item.reversalReason || 'Ko‘rsatilmagan'}
        </Alert>
      ) : null}
      {confirming ? (
        <Card
          title="Tushumni bekor qilishni tasdiqlang"
          description="Bu destructive moliyaviy amal original yozuvni o‘chirmaydi; reversal yaratadi."
          className="mb-5"
        >
          <form onSubmit={submitReverse} className="space-y-4">
            <FormField
              label="Majburiy sabab"
              htmlFor="revenue-reversal-reason"
              required
              hint="Kamida 8 ta belgi."
            >
              <Textarea
                id="revenue-reversal-reason"
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
            {reverse.isError ? (
              <Alert title="Reversal bajarilmadi" tone="danger">
                {getApiErrorMessage(reverse.error)}
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Bekor qilish
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={reverse.isPending}
                disabled={reason.trim().length < 8}
              >
                Reversal yaratish
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="rounded-xl bg-slate-50 p-6">
            <p className="text-sm font-semibold text-muted">Tushum summasi</p>
            <p
              className={`mt-2 text-3xl font-bold ${item.status === 'reversed' ? 'text-muted line-through' : 'text-ink'}`}
            >
              <MoneyText value={item.amountUzs} />
            </p>
          </div>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <Detail label="Filial" value={item.branchName} />
            <Detail label="To‘lov kanali" value={item.paymentMethodName} />
            <Detail label="Kassir" value={item.collectorName} />
            <Detail label="Kiritgan user" value={item.enteredByName} />
            <Detail label="Business sana" value={item.paymentBusinessDate} />
            <Detail label="Tashqi ma’lumotnoma" value={item.externalReference || 'Mavjud emas'} />
          </dl>
        </Card>
        <Card title="Yozuv manbasi">
          <div className="space-y-4">
            <p className="flex gap-2 text-sm text-slate-700">
              <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
              Server tomonidan hosil qilingan immutable ID
            </p>
            <Detail label="ID" value={item.id} />
            <Detail
              label="Kiritish turi"
              value={item.enteredOnBehalf ? 'Boshqa kassir nomidan' : 'Kassirning o‘zi'}
            />
            {item.onBehalfReason ? (
              <Detail label="Vakillik sababi" value={item.onBehalfReason} />
            ) : null}
          </div>
        </Card>
        <Card title="Izoh" className="lg:col-span-3">
          <p className="text-sm leading-6 text-slate-700">{item.description}</p>
        </Card>
        <Card title="Audit tarixi" className="lg:col-span-3">
          <ol className="space-y-3">
            {item.audit.map((event) => (
              <li
                key={event.id}
                className="flex flex-col justify-between gap-1 rounded-lg border border-border p-4 sm:flex-row"
              >
                <div>
                  <p className="font-semibold text-ink">{event.action}</p>
                  <p className="text-sm text-muted">
                    {event.actorName}
                    {event.reason ? ` · ${event.reason}` : ''}
                  </p>
                </div>
                <time className="text-xs tabular-nums text-muted">
                  {formatDateTime(event.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
