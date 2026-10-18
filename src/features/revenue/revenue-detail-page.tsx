import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Save } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/shared/api/client';
import { authApi, referenceApi, revenueApi } from '@/shared/api/contracts';
import { invalidateRevenueAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDate, formatDateLong, formatDateTime } from '@/shared/lib/format';
import type { DailyRevenue } from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  DefinitionItem,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  LockedNotice,
  MoneyText,
  PageHeader,
  Textarea,
} from '@/shared/ui';
import { revenueFormSchema, type RevenueFormValues, totalOf } from './revenue-form';
import { RevenueAmountFields } from './revenue-amount-fields';

function RevenueEditForm({
  revenue,
  onDone,
  requireEditReason,
}: {
  revenue: DailyRevenue;
  onDone: () => void;
  requireEditReason: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<RevenueFormValues>({
    resolver: zodResolver(revenueFormSchema),
    defaultValues: {
      businessDate: revenue.businessDate,
      branchId: revenue.branchId,
      cashUzs: revenue.cashUzs,
      cardUzs: revenue.cardUzs,
      transferUzs: revenue.transferUzs,
      comment: revenue.comment ?? '',
      editReason: '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: RevenueFormValues) =>
      revenueApi.update(revenue.id, {
        cashUzs: values.cashUzs,
        cardUzs: values.cardUzs,
        transferUzs: values.transferUzs,
        ...(values.comment?.trim() ? { comment: values.comment.trim() } : {}),
        ...(values.editReason?.trim() ? { editReason: values.editReason.trim() } : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.revenue(revenue.id) }),
        invalidateRevenueAggregates(queryClient),
      ]);
      onDone();
    },
  });
  const total = totalOf({
    cashUzs: watch('cashUzs'),
    cardUzs: watch('cardUzs'),
    transferUzs: watch('transferUzs'),
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        if (requireEditReason && !values.editReason?.trim()) {
          setError('editReason', { message: 'Tahrirlash sababini kiriting.' });
          return;
        }
        mutation.mutate(values);
      })}
      noValidate
      className="space-y-5"
    >
      {mutation.isError ? (
        <Alert title="O‘zgarishlar saqlanmadi" tone="danger">
          {getApiErrorMessage(mutation.error)}
        </Alert>
      ) : null}
      <Alert title="Immutable maydon" tone="info">
        Sana, filial va hisob davri tahrir qilinmaydi — faqat summalar va izoh yangilanadi.
      </Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Sana" htmlFor="edit-revenue-date">
          <Input id="edit-revenue-date" readOnly value={formatDate(revenue.businessDate)} />
        </FormField>
        <FormField label="Filial" htmlFor="edit-revenue-branch">
          <Input id="edit-revenue-branch" readOnly value={revenue.branchName} />
        </FormField>
        <RevenueAmountFields
          register={register}
          errors={errors}
          total={total}
          prefix="edit-revenue"
        />
        <div className="md:col-span-2">
          <FormField label="Izoh" htmlFor="edit-revenue-comment" error={errors.comment?.message}>
            <Textarea id="edit-revenue-comment" {...register('comment')} />
          </FormField>
        </div>
        {requireEditReason ? (
          <div className="md:col-span-2">
            <FormField
              label="Tahrirlash izohi"
              htmlFor="edit-revenue-reason"
              required
              error={errors.editReason?.message}
              hint="Majburiy. Ushbu izoh direktor bildirishnomasiga yuboriladi."
            >
              <Textarea
                id="edit-revenue-reason"
                required
                aria-invalid={Boolean(errors.editReason)}
                {...register('editReason')}
              />
            </FormField>
          </div>
        ) : null}
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onDone}>
          Bekor qilish
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          <Save className="h-4 w-4" /> Saqlash
        </Button>
      </div>
    </form>
  );
}

export function RevenueDetailPage() {
  const { revenueId = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.revenue(revenueId),
    queryFn: ({ signal }) => revenueApi.detail(revenueId, signal),
    enabled: Boolean(revenueId),
  });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });

  if (query.isLoading) return <LoadingState label="Tushum tafsilotlari yuklanmoqda…" />;
  if (query.isError)
    return (
      <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  if (!query.data)
    return (
      <EmptyState
        title="Tushum topilmadi"
        description="Yozuv o‘chirilgan yoki bu filialni ko‘rishga ruxsatingiz yo‘q."
      />
    );

  const revenue = query.data;
  const period = periodsQuery.data?.find((item) => item.id === revenue.periodId);
  const canEdit =
    Boolean(
      meQuery.data?.permissions.includes('revenue.edit') ||
        meQuery.data?.permissions.includes('revenue.create'),
    ) &&
    Boolean(meQuery.data?.writeBranchScopes.includes(revenue.branchId)) &&
    period?.status !== 'closed';
  const isCashier = Boolean(
    meQuery.data?.roles.some((assignment) => assignment.role === 'cashier'),
  );

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Kunlik tushum' },
          { label: formatDate(revenue.businessDate), current: true },
        ]}
      />
      <PageHeader
        title={`${formatDateLong(revenue.businessDate)} · ${revenue.branchName}`}
        description={`Kunlik tushum yozuvi · ${revenue.id}`}
        actions={
          <>
            <Link
              to={routes.revenues}
              className="inline-flex min-h-11 items-center gap-2 neu-raised-sm neu-interactive rounded-lg px-4 text-sm font-semibold text-ink hover:bg-raised"
            >
              <ArrowLeft className="h-4 w-4" /> Jurnalga qaytish
            </Link>
            {canEdit ? (
              <Button variant="secondary" onClick={() => setEditing((value) => !value)}>
                <Pencil className="h-4 w-4" /> {editing ? 'Ko‘rish rejimi' : 'Tahrirlash'}
              </Button>
            ) : null}
          </>
        }
      />
      {period?.status === 'closed' ? (
        <LockedNotice>{period.label} yopilgan. Yozuv tahrirlanmaydi.</LockedNotice>
      ) : null}

      {editing ? (
        <Card title="Kunlik tushumni tahrirlash">
          <RevenueEditForm
            revenue={revenue}
            onDone={() => setEditing(false)}
            requireEditReason={isCashier}
          />
        </Card>
      ) : (
        <Card title="Kun kesimi">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <DefinitionItem label="Jami tushum">
              <MoneyText value={revenue.totalUzs} className="text-xl font-bold" />
            </DefinitionItem>
            <DefinitionItem label="Naqd pul">
              <MoneyText value={revenue.cashUzs} />
            </DefinitionItem>
            <DefinitionItem label="Plastik karta">
              <MoneyText value={revenue.cardUzs} />
            </DefinitionItem>
            <DefinitionItem label="Bank o‘tkazmasi">
              <MoneyText value={revenue.transferUzs} />
            </DefinitionItem>
            <DefinitionItem label="Hisob davri">
              {period?.label ?? revenue.periodId}{' '}
              <span className="text-xs text-muted">
                ({period?.status === 'open' ? 'ochiq' : 'yopiq'})
              </span>
            </DefinitionItem>
            <DefinitionItem label="Kiritgan xodim">{revenue.enteredByName}</DefinitionItem>
            <DefinitionItem label="Yaratilgan">{formatDateTime(revenue.createdAt)}</DefinitionItem>
            <DefinitionItem label="Yangilangan">{formatDateTime(revenue.updatedAt)}</DefinitionItem>
          </dl>
          {revenue.comment ? (
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Izoh</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{revenue.comment}</p>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
