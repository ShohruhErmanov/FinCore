import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { invalidateRevenueAggregates } from '@/shared/api/invalidation';
import { routes } from '@/shared/config/routes';
import { getActiveWritableBranches } from '@/shared/lib/branch-scopes';
import { tashkentBusinessDate } from '@/shared/lib/format';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  LockedNotice,
  PageHeader,
  Select,
  Textarea,
} from '@/shared/ui';
import {
  revenueFormSchema,
  type RevenueFormValues,
  totalOf,
  useRevenueReferences,
} from './revenue-form';
import { RevenueAmountFields } from './revenue-amount-fields';

export function RevenueCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const references = useRevenueReferences();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<RevenueFormValues>({
    resolver: zodResolver(revenueFormSchema),
    defaultValues: {
      businessDate: tashkentBusinessDate(),
      branchId: '',
      cashUzs: '0',
      cardUzs: '0',
      transferUzs: '0',
      comment: '',
    },
  });

  const currentUser = references.me.data;
  const writableBranches = getActiveWritableBranches(
    references.branches.data ?? [],
    currentUser?.writeBranchScopes,
  );
  const fixedWriteBranch = writableBranches.length === 1 ? (writableBranches[0] ?? null) : null;
  const canChooseBranch = writableBranches.length > 1;
  const hasNoWritableBranch = Boolean(currentUser) && writableBranches.length === 0;
  const watchedDate = watch('businessDate');
  const selectedPeriod = references.periods.data?.find(
    (period) =>
      `${period.year}-${String(period.month).padStart(2, '0')}` === watchedDate.slice(0, 7),
  );
  const total = totalOf({
    cashUzs: watch('cashUzs'),
    cardUzs: watch('cardUzs'),
    transferUzs: watch('transferUzs'),
  });

  useEffect(() => {
    if (!canChooseBranch && fixedWriteBranch) setValue('branchId', fixedWriteBranch.id);
  }, [canChooseBranch, fixedWriteBranch, setValue]);

  const mutation = useMutation({
    mutationFn: revenueApi.create,
    onSuccess: async (created) => {
      await invalidateRevenueAggregates(queryClient);
      navigate(routes.revenueDetail(created.id), { replace: true });
    },
  });

  const onSubmit = handleSubmit((values) => {
    const branchId = canChooseBranch ? values.branchId : (fixedWriteBranch?.id ?? values.branchId);
    if (!branchId || !writableBranches.some((branch) => branch.id === branchId)) {
      setError('branchId', { message: 'Yozish ruxsati bor filialni tanlang.' });
      return;
    }
    if (selectedPeriod?.status === 'closed') {
      setError('businessDate', { message: 'Tanlangan sana yopiq hisob davriga tegishli.' });
      return;
    }
    mutation.mutate({
      businessDate: values.businessDate,
      branchId,
      cashUzs: values.cashUzs || '0',
      cardUzs: values.cardUzs || '0',
      transferUzs: values.transferUzs || '0',
      comment: values.comment?.trim() || undefined,
      idempotencyKey: idempotencyKey.current,
    });
  });

  const referenceLoading = Object.values(references).some((query) => query.isLoading);

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs items={[{ label: 'Kunlik tushum' }, { label: 'Yangi yozuv', current: true }]} />
      <PageHeader
        title="Kunlik tushum kiritish"
        description="Bir kun va bir filial uchun bitta yozuv. Hisob davri sanadan serverda aniqlanadi."
      />
      {referenceLoading ? <LoadingState label="Forma ma’lumotlari yuklanmoqda…" /> : null}
      {!referenceLoading ? (
        <form onSubmit={onSubmit} noValidate>
          <Card title="Kun ma’lumotlari" description="* bilan belgilangan maydonlar majburiy.">
            {mutation.isError ? (
              <Alert title="Tushum saqlanmadi" tone="danger" className="mb-5">
                {getApiErrorMessage(mutation.error)}
              </Alert>
            ) : null}
            {hasNoWritableBranch ? (
              <Alert title="Tushum kiritish bloklangan" tone="danger" className="mb-5">
                Sizga yozish mumkin bo‘lgan aktiv filial biriktirilmagan. Administratorga murojaat
                qiling.
              </Alert>
            ) : null}
            {selectedPeriod?.status === 'closed' ? (
              <LockedNotice>
                Bu sana {selectedPeriod.label} yopiq davriga tegishli. Boshqa sana tanlang.
              </LockedNotice>
            ) : null}
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <FormField
                label="Sana"
                htmlFor="revenue-date"
                required
                error={errors.businessDate?.message}
                hint={
                  selectedPeriod
                    ? `Hisob davri: ${selectedPeriod.label} — ${selectedPeriod.status === 'open' ? 'ochiq' : 'yopiq'}`
                    : 'Hisob davri sanadan serverda aniqlanadi.'
                }
              >
                <Input id="revenue-date" type="date" {...register('businessDate')} />
              </FormField>
              {canChooseBranch ? (
                <FormField
                  label="Filial"
                  htmlFor="revenue-branch"
                  required
                  error={errors.branchId?.message}
                >
                  <Select id="revenue-branch" {...register('branchId')}>
                    <option value="">Filialni tanlang</option>
                    {writableBranches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : (
                <FormField
                  label="Filial"
                  htmlFor="revenue-branch-readonly"
                  error={errors.branchId?.message}
                  hint="Filial login scope’idan olinadi."
                >
                  <Input
                    id="revenue-branch-readonly"
                    readOnly
                    value={
                      fixedWriteBranch?.name ?? 'Yozish mumkin bo‘lgan aktiv filial mavjud emas'
                    }
                  />
                </FormField>
              )}
              <RevenueAmountFields
                register={register}
                errors={errors}
                total={total}
                prefix="revenue"
              />
              <div className="md:col-span-2">
                <FormField label="Izoh" htmlFor="revenue-comment" error={errors.comment?.message}>
                  <Textarea id="revenue-comment" {...register('comment')} />
                </FormField>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (
                    !isDirty ||
                    window.confirm('Saqlanmagan o‘zgarishlar bor. Chiqishni tasdiqlaysizmi?')
                  )
                    navigate(routes.revenues);
                }}
              >
                Bekor qilish
              </Button>
              <Button
                type="submit"
                loading={mutation.isPending}
                disabled={hasNoWritableBranch || selectedPeriod?.status === 'closed'}
              >
                <Save className="h-4 w-4" /> Tushumni saqlash
              </Button>
            </div>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
