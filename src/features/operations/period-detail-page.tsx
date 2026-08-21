import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  CircleAlert,
  LockKeyhole,
  RotateCcw,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { operationsApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDateTime } from '@/shared/lib/format';
import type { CloseCheck } from '@/shared/types/domain';
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

export function PeriodDetailPage() {
  const { periodId = '' } = useParams();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<'close' | 'reopen' | null>(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [reason, setReason] = useState('');
  const readiness = useQuery({
    queryKey: queryKeys.periodReadiness(periodId),
    queryFn: ({ signal }) => operationsApi.readiness(periodId, signal),
    enabled: periodId.length > 0,
  });
  const close = useMutation({
    mutationFn: () => operationsApi.close(periodId, reason.trim()),
    onSuccess: async () => refresh(),
  });
  const reopen = useMutation({
    mutationFn: () => operationsApi.reopen(periodId, reason.trim()),
    onSuccess: async () => refresh(),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.periodReadiness(periodId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.periods }),
    ]);
    setAction(null);
    setReason('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 8) return;
    if (action === 'close') close.mutate();
    if (action === 'reopen') reopen.mutate();
  };
  if (!periodId) return <EmptyState title="Davr ID topilmadi" />;
  if (readiness.isLoading) return <LoadingState label="Close-readiness tekshirilmoqda…" />;
  if (readiness.isError)
    return (
      <ErrorState
        message={getApiErrorMessage(readiness.error)}
        onRetry={() => void readiness.refetch()}
      />
    );
  if (!readiness.data) return <EmptyState title="Davr topilmadi" />;
  const data = readiness.data;
  const isOpen = data.period.status === 'open';
  const canClose = isOpen && data.canClose && hasPermission('period.close');
  const canReopen = !isOpen && hasPermission('period.reopen');
  const mutation = action === 'close' ? close : reopen;
  return (
    <>
      <div className="mb-3">
        <Link
          to={routes.periods}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Davrlar ro‘yxati
        </Link>
      </div>
      <PageHeader
        title={data.period.label}
        description="Yopishdan oldingi tekshiruvlar, snapshot va audit tarixi."
        badge={<StatusBadge status={data.period.status} />}
        actions={
          <div className="flex gap-2">
            {canClose ? (
              <Button onClick={() => setAction('close')}>
                <LockKeyhole className="h-4 w-4" />
                Davrni yopish
              </Button>
            ) : null}
            {canReopen ? (
              <Button variant="danger" onClick={() => setAction('reopen')}>
                <RotateCcw className="h-4 w-4" />
                Qayta ochish
              </Button>
            ) : null}
          </div>
        }
      />
      {isOpen && !data.canClose ? (
        <Alert title="Davrni hozir yopib bo‘lmaydi" tone="danger" className="mb-5">
          Bloklovchi reconciliation yoki data-quality xatolarini bartaraf qiling. Warninglar
          direktor ko‘rib chiqishini talab qiladi.
        </Alert>
      ) : null}
      {!isOpen ? (
        <Alert title="Yopiq davr" tone="warning" className="mb-5">
          Original expense, budget va revenue faktlari immutable. Tuzatish uchun ruxsatli reopen
          yoki reversal ishlatiladi.
        </Alert>
      ) : null}
      {action ? (
        <Card
          title={
            action === 'close' ? 'Davrni yopishni tasdiqlang' : 'Davrni qayta ochishni tasdiqlang'
          }
          description="Sabab audit log va closure history’da saqlanadi."
          className="mb-5"
        >
          <form onSubmit={submit} className="space-y-4">
            <FormField
              label={action === 'close' ? 'Yopish izohi' : 'Qayta ochish sababi'}
              htmlFor="period-action-reason"
              required
              hint="Kamida 8 ta belgi."
            >
              <Textarea
                id="period-action-reason"
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
            {mutation.isError ? (
              <Alert title="Amal bajarilmadi" tone="danger">
                {getApiErrorMessage(mutation.error)}
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAction(null)}>
                Bekor qilish
              </Button>
              <Button
                type="submit"
                variant={action === 'reopen' ? 'danger' : 'primary'}
                loading={mutation.isPending}
                disabled={reason.trim().length < 8}
              >
                {action === 'close' ? 'Yopish' : 'Qayta ochish'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card title="Close-readiness tekshiruvlari">
          <div className="space-y-3">
            {data.checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </div>
        </Card>
        <Card title="Arxiv snapshoti">
          <div className="flex flex-col items-center rounded-xl bg-slate-50 p-6 text-center">
            <Archive className="h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold text-ink">Report snapshot</h3>
            <p className="mt-1 text-sm text-muted">
              {data.snapshot
                ? `${formatDateTime(data.snapshot.createdAt)} da ${data.snapshot.createdByName} tomonidan yaratildi.`
                : 'Snapshot davr muvaffaqiyatli yopilganda yaratiladi.'}
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              disabled={!data.snapshot}
              onClick={() => setSnapshotOpen((value) => !value)}
            >
              {snapshotOpen ? 'Arxiv rekordini yopish' : 'Arxiv rekordini ochish'}
            </Button>
            {snapshotOpen && data.snapshot ? (
              <dl className="mt-5 grid w-full gap-3 border-t border-border pt-5 text-left text-sm">
                <SnapshotValue label="Haqiqiy tushum">
                  <MoneyText value={data.snapshot.revenueActualUzs} />
                </SnapshotValue>
                <SnapshotValue label="Haqiqiy xarajat">
                  <MoneyText value={data.snapshot.expenseActualUzs} />
                </SnapshotValue>
                <SnapshotValue label="Moliyaviy natija">
                  <MoneyText value={data.snapshot.netResultUzs} />
                </SnapshotValue>
                <SnapshotValue label="Reconciliation">
                  {data.snapshot.reconciliationStatus === 'match' ? 'Mos' : 'Tafovut'}
                </SnapshotValue>
                <SnapshotValue label="Artefaktlar">
                  {data.snapshot.artifacts.join(', ')}
                </SnapshotValue>
              </dl>
            ) : null}
          </div>
        </Card>
        <Card title="Yopish / qayta ochish tarixi" className="xl:col-span-2">
          <ol className="space-y-3">
            {data.history.length ? (
              data.history.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-border p-4 sm:flex-row"
                >
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      {event.action === 'closed' ? (
                        <LockKeyhole className="h-4 w-4" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      {event.action === 'closed' ? 'Davr yopildi' : 'Davr qayta ochildi'}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {event.actorName} · {event.reason}
                    </p>
                  </div>
                  <time className="text-xs tabular-nums text-muted">
                    {formatDateTime(event.occurredAt)}
                  </time>
                </li>
              ))
            ) : (
              <p className="text-sm text-muted">Tarix mavjud emas.</p>
            )}
          </ol>
        </Card>
      </div>
    </>
  );
}

function SnapshotValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}

function CheckRow({ check }: { check: CloseCheck }) {
  const Icon = check.status === 'passed' ? CheckCircle2 : CircleAlert;
  const style =
    check.status === 'passed'
      ? 'border-green-200 bg-green-50 text-green-900'
      : check.status === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-red-200 bg-red-50 text-red-900';
  return (
    <div className={`flex items-start justify-between gap-4 rounded-xl border p-4 ${style}`}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">{check.label}</p>
          <p className="mt-1 text-sm opacity-80">{check.description}</p>
        </div>
      </div>
      <div className="shrink-0 text-right text-xs font-semibold">
        {check.count !== undefined ? <p>{check.count} ta</p> : null}
        {check.amountUzs ? <MoneyText value={check.amountUzs} /> : null}
      </div>
    </div>
  );
}
