import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, FileClock, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { invalidatePlanningAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDateTime } from '@/shared/lib/format';
import type { RevenuePlan } from '@/shared/types/domain';
import {
  Alert,
  Button,
  Card,
  CurrencyInput,
  EmptyState,
  ErrorState,
  LoadingState,
  MoneyText,
  PageHeader,
  StatusBadge,
  FormField,
  Textarea,
} from '@/shared/ui';

export function RevenuePlanDetailPage() {
  const { planId = '' } = useParams();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const plan = useQuery({
    queryKey: queryKeys.revenuePlan(planId),
    queryFn: ({ signal }) => revenueApi.plan(planId, signal),
    enabled: planId.length > 0,
  });
  const approve = useMutation({
    mutationFn: () => revenueApi.approvePlan(planId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.revenuePlan(planId) }),
        plan.data
          ? queryClient.invalidateQueries({ queryKey: queryKeys.revenuePlans(plan.data.periodId) })
          : Promise.resolve(),
        invalidatePlanningAggregates(queryClient),
      ]);
    },
  });
  const submit = useMutation({
    mutationFn: () => revenueApi.submitPlan(planId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.revenuePlan(planId) });
      if (plan.data)
        await queryClient.invalidateQueries({
          queryKey: queryKeys.revenuePlans(plan.data.periodId),
        });
    },
  });
  if (!planId) return <EmptyState title="Reja ID topilmadi" />;
  if (plan.isLoading) return <LoadingState label="Reja kartasi yuklanmoqda…" />;
  if (plan.isError)
    return (
      <ErrorState message={getApiErrorMessage(plan.error)} onRetry={() => void plan.refetch()} />
    );
  if (!plan.data) return <EmptyState title="Reja topilmadi" />;
  const item = plan.data;
  const canApprove = hasPermission('revenue_plan.approve') && item.status === 'submitted';
  const canSubmit = hasPermission('revenue_plan.submit') && item.status === 'draft';
  return (
    <>
      <div className="mb-3">
        <Link
          to={`${routes.revenuePlans}?period=${item.periodId}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Rejalar ro‘yxati
        </Link>
      </div>
      <PageHeader
        title={`${item.branchName} tushum rejasi`}
        description={`${item.periodLabel} · v${item.revisionNo}`}
        badge={<StatusBadge status={item.status} />}
        actions={
          <>
            {canSubmit ? (
              <Button onClick={() => submit.mutate()} loading={submit.isPending}>
                <FileClock className="h-4 w-4" />
                Direktorga yuborish
              </Button>
            ) : null}
            {canApprove ? (
              <Button onClick={() => approve.mutate()} loading={approve.isPending}>
                <CheckCircle2 className="h-4 w-4" />
                Tasdiqlash
              </Button>
            ) : null}
          </>
        }
      />
      {approve.isError || submit.isError ? (
        <Alert title="Holatni o‘zgartirish bajarilmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(approve.error ?? submit.error)}
        </Alert>
      ) : null}
      {item.status === 'approved' || item.status === 'locked' ? (
        <Alert title="Tasdiqlangan reja" tone="success" className="mb-5">
          Qiymatni bevosita overwrite qilib bo‘lmaydi. O‘zgartirish yangi auditli reviziya yaratishi
          kerak.
        </Alert>
      ) : null}
      {item.status === 'draft' && hasPermission('revenue_plan.create_edit') ? (
        <DraftPlanEditor plan={item} />
      ) : null}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="rounded-xl bg-slate-50 p-6">
            <p className="text-sm font-semibold text-muted">Kutilgan tushum</p>
            <p className="mt-2 text-3xl font-bold text-ink">
              <MoneyText value={item.plannedAmountUzs} />
            </p>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Detail label="Filial" value={item.branchName} />
            <Detail label="Davr" value={item.periodLabel} />
            <Detail label="Reviziya" value={`v${item.revisionNo}`} />
            <Detail label="Yangilangan" value={formatDateTime(item.updatedAt)} />
          </dl>
        </Card>
        <Card title="Tasdiqlash tarixi">
          <div className="space-y-4">
            <Timeline label="Reja yangilandi" value={formatDateTime(item.updatedAt)} />
            <Timeline label="Yubordi" value={item.submittedByName ?? 'Hali yuborilmagan'} />
            <Timeline label="Tasdiqladi" value={item.approvedByName ?? 'Hali tasdiqlanmagan'} />
          </div>
        </Card>
        <Card title="Izoh" className="lg:col-span-3">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {item.reason || 'Izoh kiritilmagan.'}
          </p>
        </Card>
      </div>
    </>
  );
}

function DraftPlanEditor({ plan }: { plan: RevenuePlan }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(plan.plannedAmountUzs);
  const [reason, setReason] = useState(plan.reason ?? '');
  const [validation, setValidation] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => revenueApi.updatePlan(plan.id, { plannedAmountUzs: amount, reason }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.revenuePlan(plan.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.revenuePlans(plan.periodId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.report('revenue-plan-summary', plan.periodId),
        }),
      ]);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d+$/.test(amount)) return setValidation('Reja summasi butun so‘m bo‘lishi kerak.');
    if (reason.trim().length < 5)
      return setValidation('O‘zgartirish sababini kamida 5 ta belgi bilan yozing.');
    setValidation(null);
    mutation.mutate();
  };
  return (
    <Card title="Qoralama reviziyani tahrirlash" className="mb-5">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <FormField label="Kutilgan tushum" htmlFor="draft-plan-amount" required>
          <CurrencyInput
            id="draft-plan-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
          />
        </FormField>
        <FormField label="Reviziya sababi" htmlFor="draft-plan-reason" required>
          <Textarea
            id="draft-plan-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        {validation ? (
          <Alert title="Formani tekshiring" tone="danger" className="md:col-span-2">
            {validation}
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert title="Qoralama saqlanmadi" tone="danger" className="md:col-span-2">
            {getApiErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className="flex justify-end md:col-span-2">
          <Button type="submit" loading={mutation.isPending}>
            <Save className="h-4 w-4" /> Qoralamani saqlash
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}
function Timeline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 rounded-full bg-blue-50 p-1.5 text-primary">
        <FileClock className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-muted">{value}</p>
      </div>
    </div>
  );
}
