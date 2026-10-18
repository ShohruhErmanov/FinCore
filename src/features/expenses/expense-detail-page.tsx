import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Save, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { authApi, expenseApi, referenceApi } from '@/shared/api/contracts';
import { getApiErrorMessage } from '@/shared/api/client';
import { invalidateExpenseAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import type { Expense } from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CurrencyInput,
  DefinitionItem,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  LockedNotice,
  MoneyText,
  PageHeader,
  Select,
  Textarea,
} from '@/shared/ui';
import { expenseFormSchema, type ExpenseFormValues, useExpenseReferences } from './expense-form';

function ExpenseEditForm({
  expense,
  onDone,
  requireEditReason,
}: {
  expense: Expense;
  onDone: () => void;
  requireEditReason: boolean;
}) {
  const queryClient = useQueryClient();
  const references = useExpenseReferences();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      transactionDate: expense.transactionDate,
      branchId: expense.branchId,
      categoryId: expense.categoryId,
      description: expense.description,
      amountUzs: expense.amountUzs,
      paymentMethodId: expense.paymentMethodId,
      departmentId: expense.departmentId,
      responsibleUserId: expense.responsibleUserId,
      editReason: '',
    },
  });
  const selectedCategory = references.categories.data?.find(
    (category) => category.id === watch('categoryId'),
  );
  const mutation = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      expenseApi.update(expense.id, {
        transactionDate: values.transactionDate,
        categoryId: values.categoryId,
        description: values.description,
        amountUzs: values.amountUzs,
        paymentMethodId: values.paymentMethodId,
        departmentId: values.departmentId,
        responsibleUserId: values.responsibleUserId,
        ...(values.editReason?.trim() ? { editReason: values.editReason.trim() } : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.expense(expense.id) }),
        invalidateExpenseAggregates(queryClient),
      ]);
      onDone();
    },
  });

  if (
    references.categories.isLoading ||
    references.departments.isLoading ||
    references.paymentMethods.isLoading ||
    references.users.isLoading
  )
    return <LoadingState label="Tahrirlash formasi yuklanmoqda…" />;

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
        Filial, kiritgan xodim, hisob davri va audit maydonlari tahrir qilinmaydi.
      </Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Sana"
          htmlFor="edit-expense-date"
          required
          error={errors.transactionDate?.message}
        >
          <Input id="edit-expense-date" type="date" {...register('transactionDate')} />
        </FormField>
        <FormField label="Filial" htmlFor="edit-expense-branch">
          <Input id="edit-expense-branch" readOnly value={expense.branchName} />
        </FormField>
        <FormField
          label="Kategoriya"
          htmlFor="edit-expense-category"
          required
          error={errors.categoryId?.message}
        >
          <Select id="edit-expense-category" {...register('categoryId')}>
            {(references.categories.data ?? [])
              .filter((item) => item.isActive || item.id === expense.categoryId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {!item.isActive ? ' (inaktiv)' : ''}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Turi (hisoblanadi)" htmlFor="edit-expense-type">
          <Input
            id="edit-expense-type"
            readOnly
            value={selectedCategory?.expenseType === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
          />
        </FormField>
        <FormField
          label="Summa"
          htmlFor="edit-expense-amount"
          required
          error={errors.amountUzs?.message}
        >
          <CurrencyInput id="edit-expense-amount" {...register('amountUzs')} />
        </FormField>
        <FormField
          label="To‘lov usuli"
          htmlFor="edit-expense-payment"
          required
          error={errors.paymentMethodId?.message}
        >
          <Select id="edit-expense-payment" {...register('paymentMethodId')}>
            {(references.paymentMethods.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Bo‘lim"
          htmlFor="edit-expense-department"
          required
          error={errors.departmentId?.message}
        >
          <Select id="edit-expense-department" {...register('departmentId')}>
            {(references.departments.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Mas’ul"
          htmlFor="edit-expense-responsible"
          required
          error={errors.responsibleUserId?.message}
        >
          <Select id="edit-expense-responsible" {...register('responsibleUserId')}>
            {(references.users.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
                {item.status !== 'active' ? ' (tarixiy)' : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="md:col-span-2">
          <FormField
            label="Tavsif"
            htmlFor="edit-expense-description"
            required
            error={errors.description?.message}
          >
            <Textarea id="edit-expense-description" {...register('description')} />
          </FormField>
        </div>
        {requireEditReason ? (
          <div className="md:col-span-2">
            <FormField
              label="Tahrirlash izohi"
              htmlFor="edit-expense-reason"
              required
              error={errors.editReason?.message}
              hint="Majburiy. Ushbu izoh direktor bildirishnomasiga yuboriladi."
            >
              <Textarea
                id="edit-expense-reason"
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

export function ExpenseDetailPage() {
  const { expenseId = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.expense(expenseId),
    queryFn: ({ signal }) => expenseApi.detail(expenseId, signal),
    enabled: Boolean(expenseId),
  });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });

  if (query.isLoading) return <LoadingState label="Xarajat tafsilotlari yuklanmoqda…" />;
  if (query.isError)
    return (
      <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  if (!query.data)
    return (
      <EmptyState
        title="Xarajat topilmadi"
        description="Yozuv o‘chirilgan yoki bu filialni ko‘rishga ruxsatingiz yo‘q."
      />
    );

  const expense = query.data;
  const period = periodsQuery.data?.find((item) => item.id === expense.periodId);
  const canWriteBranch = Boolean(meQuery.data?.writeBranchScopes.includes(expense.branchId));
  const canEdit =
    Boolean(meQuery.data?.permissions.includes('expense.edit')) &&
    canWriteBranch &&
    period?.status !== 'closed';
  const isCashier = Boolean(
    meQuery.data?.roles.some((assignment) => assignment.role === 'cashier'),
  );

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Xarajatlar' }, { label: expense.id, current: true }]} />
      <PageHeader
        title={expense.description}
        description={`Xarajat ID: ${expense.id}`}
        actions={
          <>
            <Link
              to={routes.expenses}
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
        <LockedNotice>{period.label} yopilgan. Original xarajat tahrirlanmaydi.</LockedNotice>
      ) : null}

      {editing ? (
        <Card title="Xarajatni tahrirlash">
          <ExpenseEditForm
            expense={expense}
            onDone={() => setEditing(false)}
            requireEditReason={isCashier}
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-5">
            <Card title="Asosiy ma’lumotlar">
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <DefinitionItem label="Summa">
                  <MoneyText value={expense.amountUzs} className="text-xl font-bold" />
                </DefinitionItem>
                <DefinitionItem label="Sana">{formatDate(expense.transactionDate)}</DefinitionItem>
                <DefinitionItem label="Hisob davri">
                  {period?.label ?? expense.periodId}{' '}
                  {period ? (
                    <span className="text-xs text-muted">
                      ({period.status === 'open' ? 'ochiq' : 'yopiq'})
                    </span>
                  ) : null}
                </DefinitionItem>
                <DefinitionItem label="Filial">{expense.branchName}</DefinitionItem>
                <DefinitionItem label="Kategoriya">{expense.categoryNameSnapshot}</DefinitionItem>
                <DefinitionItem label="Tarixiy turi">
                  {expense.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                </DefinitionItem>
                <DefinitionItem label="To‘lov usuli">{expense.paymentMethodName}</DefinitionItem>
                <DefinitionItem label="Bo‘lim">{expense.departmentName}</DefinitionItem>
                <DefinitionItem label="Mas’ul">{expense.responsibleUserName}</DefinitionItem>
                <DefinitionItem label="Kiritgan xodim">{expense.enteredByName}</DefinitionItem>
                <DefinitionItem label="Yaratilgan">
                  {formatDateTime(expense.createdAt)}
                </DefinitionItem>
                <DefinitionItem label="Yangilangan">
                  {formatDateTime(expense.updatedAt)}
                </DefinitionItem>
              </dl>
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tavsif</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{expense.description}</p>
              </div>
              {expense.comment ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Izoh</p>
                  <p className="mt-2 text-sm text-slate-700">{expense.comment}</p>
                </div>
              ) : null}
            </Card>
          </div>
          <div className="space-y-5">
            <Card title="Manba va izchillik">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-semibold text-ink">Server hosil qilgan ID</p>
                  <p className="mt-1 break-all text-xs text-muted">{expense.id}</p>
                </div>
              </div>
            </Card>
            <Card
              title="Biriktirmalar"
              description="Receipt, invoice va foto oqimi V1.1 doirasida."
            >
              <EmptyState
                title="Biriktirma mavjud emas"
                description="V1 ekranida holat ko‘rinadi; yuklash funksiyasi V1.1’da yoqiladi."
              />
            </Card>
            <Card title="Hisob semantikasi">
              <p className="text-sm leading-6 text-slate-600">
                Kategoriya nomi yoki turi keyinchalik o‘zgarsa ham bu tranzaksiyada{' '}
                <strong className="text-ink">{expense.categoryNameSnapshot}</strong> va{' '}
                <strong className="text-ink">
                  {expense.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                </strong>{' '}
                snapshot’i saqlanadi.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
