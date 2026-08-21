import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, LockKeyhole } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { invalidateRevenueAggregates } from '@/shared/api/invalidation';
import { routes } from '@/shared/config/routes';
import {
  Alert,
  Button,
  Card,
  CurrencyInput,
  FormField,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/shared/ui';
import { ReferenceBoundary, useRevenueReferences } from './revenue-shared';

export function NewRevenuePage() {
  const { user, hasPermission, canWriteBranch } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const references = useRevenueReferences();
  const initialBranch =
    user?.writeBranchScopes.length === 1 ? (user.writeBranchScopes[0] ?? '') : '';
  const [branchId, setBranchId] = useState(initialBranch);
  const [collectorId, setCollectorId] = useState(
    hasPermission('revenue.enter_on_behalf') ? '' : (user?.id ?? ''),
  );
  const [paymentAt, setPaymentAt] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('Filial tushumi');
  const [onBehalfReason, setOnBehalfReason] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const canEnterOnBehalf = hasPermission('revenue.enter_on_behalf');
  const branchLocked = (user?.writeBranchScopes.length ?? 0) <= 1;
  const collectors = useMemo(
    () =>
      references.users.data?.filter(
        (item) =>
          item.status === 'active' &&
          item.roles.some(
            (role) => role.role === 'cashier' && (!branchId || role.branchId === branchId),
          ),
      ) ?? [],
    [branchId, references.users.data],
  );
  useEffect(() => {
    if (!canEnterOnBehalf && user) setCollectorId(user.id);
  }, [canEnterOnBehalf, user]);
  const mutation = useMutation({
    mutationFn: () =>
      revenueApi.create({
        paymentAt: `${paymentAt}:00+05:00`,
        branchId,
        amountUzs: amount,
        paymentMethodId,
        collectorUserId: collectorId,
        onBehalfReason: collectorId !== user?.id ? onBehalfReason.trim() : undefined,
        externalReference: reference.trim() || undefined,
        description: description.trim(),
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: async (created) => {
      await invalidateRevenueAggregates(queryClient);
      navigate(routes.revenueDetail(created.id));
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!branchId || !canWriteBranch(branchId))
      return setValidation('Ruxsat berilgan filialni tanlang.');
    if (!paymentAt) return setValidation('Tushum sanasi va vaqtini kiriting.');
    if (!/^[1-9]\d*$/.test(amount))
      return setValidation('Summa musbat butun so‘mda bo‘lishi kerak.');
    if (!paymentMethodId) return setValidation('To‘lov kanalini tanlang.');
    if (!collectorId) return setValidation('Pulni qabul qilgan kassirni tanlang.');
    if (collectorId !== user?.id && onBehalfReason.trim().length < 5)
      return setValidation('Boshqa kassir nomidan kiritish sababini yozing.');
    if (description.trim().length < 3) return setValidation('Tushum izohini kiriting.');
    setValidation(null);
    mutation.mutate();
  };
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
        title="Yangi tushum"
        description="Kassirning filial scope’i, qabul qiluvchi va hisob davri server tomonidan qayta tekshiriladi."
      />
      <ReferenceBoundary
        queries={[references.branches, references.paymentMethods, references.users]}
      >
        <form
          onSubmit={submit}
          noValidate
          className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
        >
          <Card title="Tushum ma’lumotlari">
            <div className="grid gap-5 md:grid-cols-2">
              <FormField
                label="Filial"
                htmlFor="revenue-branch"
                required
                hint={branchLocked ? 'Filial sizning ruxsat doirangizdan olingan.' : undefined}
              >
                <Select
                  id="revenue-branch"
                  value={branchId}
                  disabled={branchLocked}
                  onChange={(event) => {
                    setBranchId(event.target.value);
                    setCollectorId('');
                  }}
                >
                  {!branchLocked ? <option value="">Tanlang</option> : null}
                  {references.branches.data
                    ?.filter((branch) => canWriteBranch(branch.id))
                    .map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField
                label="To‘lov sanasi va vaqti"
                htmlFor="revenue-date"
                required
                hint="Asia/Tashkent (+05:00)"
              >
                <Input
                  id="revenue-date"
                  type="datetime-local"
                  value={paymentAt}
                  onChange={(event) => setPaymentAt(event.target.value)}
                />
              </FormField>
              <FormField label="Summa" htmlFor="revenue-amount" required>
                <CurrencyInput
                  id="revenue-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
                />
              </FormField>
              <FormField label="To‘lov kanali" htmlFor="revenue-method" required>
                <Select
                  id="revenue-method"
                  value={paymentMethodId}
                  onChange={(event) => setPaymentMethodId(event.target.value)}
                >
                  <option value="">Tanlang</option>
                  {references.paymentMethods.data
                    ?.filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField
                label="Pulni qabul qilgan kassir"
                htmlFor="revenue-collector"
                required
                hint={!canEnterOnBehalf ? 'Kassir loginidan avtomatik olinadi.' : undefined}
              >
                <Select
                  id="revenue-collector"
                  value={collectorId}
                  disabled={!canEnterOnBehalf}
                  onChange={(event) => setCollectorId(event.target.value)}
                >
                  {canEnterOnBehalf ? <option value="">Tanlang</option> : null}
                  {collectors.map((collector) => (
                    <option key={collector.id} value={collector.id}>
                      {collector.fullName}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Bank/terminal ma’lumotnomasi"
                htmlFor="revenue-reference"
                hint="Naqd tushumda bo‘sh qolishi mumkin."
              >
                <Input
                  id="revenue-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </FormField>
              {collectorId && collectorId !== user?.id ? (
                <div className="md:col-span-2">
                  <FormField
                    label="Boshqa kassir nomidan kiritish sababi"
                    htmlFor="on-behalf-reason"
                    required
                  >
                    <Textarea
                      id="on-behalf-reason"
                      value={onBehalfReason}
                      onChange={(event) => setOnBehalfReason(event.target.value)}
                    />
                  </FormField>
                </div>
              ) : null}
              <div className="md:col-span-2">
                <FormField label="Izoh" htmlFor="revenue-description" required>
                  <Textarea
                    id="revenue-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </FormField>
              </div>
              {validation ? (
                <Alert title="Formani tekshiring" tone="danger" className="md:col-span-2">
                  {validation}
                </Alert>
              ) : null}
              {mutation.isError ? (
                <Alert title="Tushumni saqlab bo‘lmadi" tone="danger" className="md:col-span-2">
                  {getApiErrorMessage(mutation.error)}
                </Alert>
              ) : null}
            </div>
          </Card>
          <div className="space-y-5">
            <Alert title="Server-authoritative yozuv" tone="info">
              Filial, kassir, davr va status backendda sessiya hamda sanadan kelib chiqib
              tekshiriladi.
            </Alert>
            <Card title="Yakunlash">
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-sm text-slate-600">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                  Yopiq davrga tushum qo‘shib bo‘lmaydi.
                </p>
                <Button type="submit" className="w-full" size="lg" loading={mutation.isPending}>
                  <Banknote className="h-5 w-5" />
                  Tushumni saqlash
                </Button>
              </div>
            </Card>
          </div>
        </form>
      </ReferenceBoundary>
    </>
  );
}
