import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePlus, Eye, Target } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { revenueApi } from '@/shared/api/contracts';
import { getApiErrorMessage } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import type { RevenuePlan } from '@/shared/types/domain';
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
  MoneyText,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  type Column,
} from '@/shared/ui';
import { ReferenceBoundary, useRevenueReferences } from './revenue-shared';

export function RevenuePlansPage() {
  const { hasPermission } = useAuth();
  const references = useRevenueReferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultPeriodId =
    references.periods.data?.find((period) => period.status === 'open')?.id ??
    references.periods.data?.[0]?.id ??
    '';
  const periodId = searchParams.get('period') || defaultPeriodId;
  const [showCreate, setShowCreate] = useState(false);
  const plans = useQuery({
    queryKey: queryKeys.revenuePlans(periodId),
    queryFn: ({ signal }) => revenueApi.plans(periodId, signal),
    enabled: periodId.length > 0,
  });
  const summary = useQuery({
    queryKey: queryKeys.report('revenue-plan-summary', periodId),
    queryFn: ({ signal }) => revenueApi.planSummary(periodId, signal),
    enabled: periodId.length > 0,
  });
  const columns: Column<RevenuePlan>[] = [
    {
      key: 'branch',
      header: 'Filial',
      cell: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.branchName}</p>
          <p className="text-xs text-muted">{row.periodLabel}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Kutilgan tushum',
      className: 'text-right',
      cell: (row) => <MoneyText value={row.plannedAmountUzs} className="font-semibold text-ink" />,
    },
    {
      key: 'revision',
      header: 'Reviziya',
      cell: (row) => <span className="tabular-nums">v{row.revisionNo}</span>,
    },
    { key: 'status', header: 'Holat', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (row) => (
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-blue-50"
          to={routes.revenuePlanDetail(row.id)}
        >
          <Eye className="h-4 w-4" />
          Ko‘rish
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Tushum rejalari"
        description="Har bir filialning kutilgan oylik tushumi alohida tasdiqlanadi; markaz rejasi ularning yig‘indisidir."
        actions={
          hasPermission('revenue_plan.create_edit') ? (
            <Button onClick={() => setShowCreate((value) => !value)}>
              <CirclePlus className="h-4 w-4" />
              Yangi reja
            </Button>
          ) : undefined
        }
      />
      <ReferenceBoundary queries={[references.periods, references.branches, summary]}>
        <Card className="mb-5">
          <label htmlFor="revenue-plan-period" className="block max-w-sm space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Hisob davri
            </span>
            <Select
              id="revenue-plan-period"
              value={periodId}
              onChange={(event) => setSearchParams({ period: event.target.value })}
            >
              {references.periods.data?.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label} · {period.status === 'closed' ? 'Yopiq' : 'Ochiq'}
                </option>
              ))}
            </Select>
          </label>
        </Card>
        {showCreate ? (
          <PlanCreatePanel periodId={periodId} onClose={() => setShowCreate(false)} />
        ) : null}
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <KpiCard
            label="Markaz rejasi"
            value={<MoneyText value={summary.data?.totalPlannedAmountUzs ?? '0'} />}
            helper="Filial rejalari yig‘indisi; alohida hardcode qilinmaydi."
            tone="info"
          />
          <KpiCard
            label="Tasdiqlangan filiallar"
            value={`${summary.data?.branchesWithPlan ?? 0} / ${summary.data?.expectedBranchCount ?? 0}`}
            helper="Direktor tasdiqlagan yoki yopilgan rejalar."
            tone={summary.data?.planComplete ? 'success' : 'warning'}
          />
          <KpiCard
            label="Filiallar"
            value={references.branches.data?.length ?? 0}
            helper="V1 doirasidagi faol filiallar soni."
          />
        </div>
        {plans.isLoading ? (
          <LoadingState label="Tushum rejalari yuklanmoqda…" />
        ) : plans.isError ? (
          <ErrorState
            message={getApiErrorMessage(plans.error)}
            onRetry={() => void plans.refetch()}
          />
        ) : plans.data?.length ? (
          <Card>
            <DataTable columns={columns} rows={plans.data} caption="Filial tushum rejalari" />
          </Card>
        ) : (
          <EmptyState
            title="Bu davr uchun reja yo‘q"
            description="Har bir filial uchun tushum rejasini kiriting."
          />
        )}
      </ReferenceBoundary>
    </>
  );
}

function PlanCreatePanel({ periodId, onClose }: { periodId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const references = useRevenueReferences();
  const [branchId, setBranchId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      revenueApi.createPlan({
        periodId,
        branchId,
        plannedAmountUzs: amount,
        reason,
        status: 'draft',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.revenuePlans(periodId) });
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!branchId) return setValidation('Filialni tanlang.');
    if (!/^[1-9]\d*$/.test(amount))
      return setValidation('Summa musbat butun so‘mda bo‘lishi kerak.');
    if (reason.trim().length < 5)
      return setValidation('Reja sababini kamida 5 ta belgi bilan yozing.');
    setValidation(null);
    mutation.mutate();
  };
  return (
    <Card
      title="Yangi filial rejasi"
      description="Mavjud tasdiqlangan rejani o‘zgartirish yangi reviziya yaratadi."
      className="mb-5"
    >
      <form className="grid gap-4 lg:grid-cols-2" onSubmit={submit} noValidate>
        <FormField label="Filial" htmlFor="plan-branch" required>
          <Select
            id="plan-branch"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="">Tanlang</option>
            {references.branches.data?.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Kutilgan tushum"
          htmlFor="plan-amount"
          required
          hint="Tiyinsiz, musbat butun so‘m."
        >
          <CurrencyInput
            id="plan-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
          />
        </FormField>
        <div className="lg:col-span-2">
          <FormField label="Reja sababi" htmlFor="plan-reason" required>
            <Textarea
              id="plan-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>
        </div>
        {validation ? (
          <Alert title="Formani tekshiring" tone="danger" className="lg:col-span-2">
            {validation}
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert title="Rejani saqlab bo‘lmadi" tone="danger" className="lg:col-span-2">
            {getApiErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2 lg:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            <Target className="h-4 w-4" />
            Qoralama saqlash
          </Button>
        </div>
      </form>
    </Card>
  );
}
