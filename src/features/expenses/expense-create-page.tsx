import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { expenseApi } from '@/shared/api/contracts';
import { getApiErrorMessage } from '@/shared/api/client';
import { invalidateExpenseAggregates } from '@/shared/api/invalidation';
import { routes } from '@/shared/config/routes';
import { getActiveWritableBranches } from '@/shared/lib/branch-scopes';
import { tashkentBusinessDate } from '@/shared/lib/format';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CurrencyInput,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  LockedNotice,
  PageHeader,
  Select,
  Textarea,
} from '@/shared/ui';
import { expenseFormSchema, type ExpenseFormValues, useExpenseReferences } from './expense-form';

export function ExpenseCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const references = useExpenseReferences();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      transactionDate: tashkentBusinessDate(),
      branchId: '',
      categoryId: '',
      description: '',
      amountUzs: '',
      paymentMethodId: '',
      departmentId: '',
      responsibleUserId: '',
    },
  });

  const watchedCategory = watch('categoryId');
  const watchedDate = watch('transactionDate');
  const currentUser = references.me.data;
  const writableBranches = getActiveWritableBranches(
    references.branches.data ?? [],
    currentUser?.writeBranchScopes,
  );
  const fixedWriteBranch = writableBranches.length === 1 ? (writableBranches[0] ?? null) : null;
  const canChooseBranch = writableBranches.length > 1;
  const hasNoWritableBranch = Boolean(currentUser) && writableBranches.length === 0;
  const selectedCategory = references.categories.data?.find((item) => item.id === watchedCategory);
  const selectedPeriod = references.periods.data?.find(
    (period) =>
      `${period.year}-${String(period.month).padStart(2, '0')}` === watchedDate.slice(0, 7),
  );

  useEffect(() => {
    if (!canChooseBranch && fixedWriteBranch) setValue('branchId', fixedWriteBranch.id);
    if (!watch('responsibleUserId') && currentUser?.id)
      setValue('responsibleUserId', currentUser.id);
  }, [canChooseBranch, fixedWriteBranch, currentUser?.id, setValue, watch]);

  const mutation = useMutation({
    mutationFn: expenseApi.create,
    onSuccess: async (created) => {
      await invalidateExpenseAggregates(queryClient);
      navigate(routes.expenseDetail(created.id), { replace: true });
    },
  });

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || mutation.isSuccess) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty, mutation.isSuccess]);

  const cancelCreate = () => {
    if (
      !isDirty ||
      window.confirm('Saqlanmagan o‘zgarishlar bor. Formadan chiqishni tasdiqlaysizmi?')
    ) {
      navigate(routes.expenses);
    }
  };

  const onSubmit = handleSubmit((values) => {
    const branchId = canChooseBranch ? values.branchId : (fixedWriteBranch?.id ?? values.branchId);
    if (!branchId || !writableBranches.some((branch) => branch.id === branchId)) {
      setError('branchId', { message: 'Yozish ruxsati bor filialni tanlang.' });
      return;
    }
    if (selectedPeriod?.status === 'closed') {
      setError('transactionDate', { message: 'Tanlangan sana yopiq hisob davriga tegishli.' });
      return;
    }
    mutation.mutate({
      ...values,
      branchId,
      idempotencyKey: idempotencyKey.current,
    });
  });

  const referenceLoading = Object.values(references).some((query) => query.isLoading);
  const referenceError = Object.values(references).find((query) => query.isError)?.error;

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumbs items={[{ label: 'Xarajatlar' }, { label: 'Yangi xarajat', current: true }]} />
      <PageHeader
        title="Yangi xarajat"
        description="Qo‘lda kiritiladigan qiymatlar tekshiriladi; davr va kategoriya turi server tomonidan hosil qilinadi."
      />
      {referenceLoading ? <LoadingState label="Forma ma’lumotlari yuklanmoqda…" /> : null}
      {referenceError ? <ErrorState message={getApiErrorMessage(referenceError)} /> : null}
      {!referenceLoading && !referenceError ? (
        <form onSubmit={onSubmit} noValidate>
          <Card
            title="Tranzaksiya ma’lumotlari"
            description="* bilan belgilangan maydonlar majburiy."
          >
            {mutation.isError ? (
              <Alert title="Xarajat saqlanmadi" tone="danger" className="mb-5">
                {getApiErrorMessage(mutation.error)}
              </Alert>
            ) : null}
            {hasNoWritableBranch ? (
              <Alert title="Xarajat kiritish bloklangan" tone="danger" className="mb-5">
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
                label="Xarajat sanasi"
                htmlFor="transaction-date"
                required
                error={errors.transactionDate?.message}
                hint={
                  selectedPeriod
                    ? `Hisob davri: ${selectedPeriod.label} — ${selectedPeriod.status === 'open' ? 'ochiq' : 'yopiq'}`
                    : 'Hisob davri sanadan serverda aniqlanadi.'
                }
              >
                <Input
                  id="transaction-date"
                  type="date"
                  aria-invalid={Boolean(errors.transactionDate)}
                  aria-describedby={errors.transactionDate ? 'transaction-date-error' : undefined}
                  {...register('transactionDate')}
                />
              </FormField>
              {canChooseBranch ? (
                <FormField
                  label="Filial"
                  htmlFor="expense-form-branch"
                  required
                  error={errors.branchId?.message}
                >
                  <Select
                    id="expense-form-branch"
                    aria-invalid={Boolean(errors.branchId)}
                    aria-describedby={errors.branchId ? 'expense-form-branch-error' : undefined}
                    {...register('branchId')}
                  >
                    <option value="">Filialni tanlang</option>
                    {writableBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : (
                <FormField
                  label="Filial"
                  htmlFor="expense-form-branch-readonly"
                  error={errors.branchId?.message}
                  hint="Filial login scope’idan olinadi va qo‘lda almashtirilmaydi."
                >
                  <Input
                    id="expense-form-branch-readonly"
                    readOnly
                    value={
                      fixedWriteBranch?.name ?? 'Yozish mumkin bo‘lgan aktiv filial mavjud emas'
                    }
                  />
                </FormField>
              )}
              <FormField
                label="Kategoriya"
                htmlFor="expense-form-category"
                required
                error={errors.categoryId?.message}
              >
                <Select
                  id="expense-form-category"
                  aria-invalid={Boolean(errors.categoryId)}
                  aria-describedby={errors.categoryId ? 'expense-form-category-error' : undefined}
                  {...register('categoryId')}
                >
                  <option value="">Kategoriyani tanlang</option>
                  {(references.categories.data ?? [])
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField
                label="Xarajat turi (hisoblanadi)"
                htmlFor="expense-form-type"
                hint="Kategoriya turining tarixiy snapshot’i serverda saqlanadi."
              >
                <Input
                  id="expense-form-type"
                  readOnly
                  value={
                    selectedCategory
                      ? selectedCategory.expenseType === 'fixed'
                        ? 'Doimiy'
                        : 'O‘zgaruvchan'
                      : 'Kategoriya tanlang'
                  }
                />
              </FormField>
              <FormField
                label="Summa"
                htmlFor="expense-form-amount"
                required
                error={errors.amountUzs?.message}
                hint="Musbat, butun UZS qiymati."
              >
                <CurrencyInput
                  id="expense-form-amount"
                  aria-invalid={Boolean(errors.amountUzs)}
                  aria-describedby={errors.amountUzs ? 'expense-form-amount-error' : undefined}
                  {...register('amountUzs')}
                />
              </FormField>
              <FormField
                label="To‘lov usuli"
                htmlFor="expense-form-payment"
                required
                error={errors.paymentMethodId?.message}
              >
                <Select
                  id="expense-form-payment"
                  aria-invalid={Boolean(errors.paymentMethodId)}
                  aria-describedby={
                    errors.paymentMethodId ? 'expense-form-payment-error' : undefined
                  }
                  {...register('paymentMethodId')}
                >
                  <option value="">To‘lov usulini tanlang</option>
                  {(references.paymentMethods.data ?? [])
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField
                label="Bo‘lim"
                htmlFor="expense-form-department"
                required
                error={errors.departmentId?.message}
              >
                <Select
                  id="expense-form-department"
                  aria-invalid={Boolean(errors.departmentId)}
                  aria-describedby={
                    errors.departmentId ? 'expense-form-department-error' : undefined
                  }
                  {...register('departmentId')}
                >
                  <option value="">Bo‘limni tanlang</option>
                  {(references.departments.data ?? [])
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField
                label="Mas’ul xodim"
                htmlFor="expense-form-responsible"
                required
                error={errors.responsibleUserId?.message}
                hint="Erkin matn emas, xavfsiz user katalogidan tanlanadi."
              >
                <Select
                  id="expense-form-responsible"
                  aria-invalid={Boolean(errors.responsibleUserId)}
                  aria-describedby={
                    errors.responsibleUserId ? 'expense-form-responsible-error' : undefined
                  }
                  {...register('responsibleUserId')}
                >
                  <option value="">Mas’ul xodimni tanlang</option>
                  {(references.users.data ?? [])
                    .filter((item) => item.status === 'active')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                      </option>
                    ))}
                </Select>
              </FormField>
              <div className="md:col-span-2">
                <FormField
                  label="Tavsif"
                  htmlFor="expense-form-description"
                  required
                  error={errors.description?.message}
                  hint="Nima uchun xarajat qilinganini aniq yozing."
                >
                  <Textarea
                    id="expense-form-description"
                    aria-invalid={Boolean(errors.description)}
                    aria-describedby={
                      errors.description ? 'expense-form-description-error' : undefined
                    }
                    {...register('description')}
                  />
                </FormField>
              </div>
            </div>
            <Alert title="Server tekshiruvi majburiy" tone="info" className="mt-5">
              Filial scope’i, ochiq davr, kategoriya turi va audit maydonlari backend tomonidan
              qayta tekshiriladi. Frontenddagi cheklov xavfsizlik chegarasi emas.
            </Alert>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={cancelCreate}>
                Bekor qilish
              </Button>
              <Button
                type="submit"
                loading={mutation.isPending}
                disabled={hasNoWritableBranch || selectedPeriod?.status === 'closed'}
              >
                <Save className="h-4 w-4" /> Xarajatni saqlash
              </Button>
            </div>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
