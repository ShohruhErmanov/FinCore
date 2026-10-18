import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, UserCog } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import type {
  AccountingPeriod,
  InvestorCapitalPaymentMethodCode,
  MasterItem,
  RoleCode,
} from '@/shared/types/domain';
import { Alert, Button, Card, CurrencyInput, FormField, Input, Select } from '@/shared/ui';
import { formatCapitalInput } from './user-access';

export function CreateUserPanel({
  branches,
  periods,
  paymentMethods,
  canCreateInvestor,
  onClose,
}: {
  branches: Array<{ id: string; name: string }>;
  periods: AccountingPeriod[];
  paymentMethods: MasterItem[];
  canCreateInvestor: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<RoleCode>('cashier');
  const [alsoCashier, setAlsoCashier] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Ulush, kapital va keyingi payout — uchta mustaqil moliyaviy tushuncha.
  const [ownershipPercent, setOwnershipPercent] = useState('');
  const [capitalAmountUzs, setCapitalAmountUzs] = useState('');
  const [startPeriodId, setStartPeriodId] = useState('');
  const [capitalPaymentMethodCode, setCapitalPaymentMethodCode] = useState<
    InvestorCapitalPaymentMethodCode | ''
  >('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      adminApi.createUser({
        fullName: fullName.trim(),
        phone: phone.trim(),
        role,
        branchId: role === 'cashier' || role === 'investor' ? branchId || null : null,
        cashierBranchId: role === 'finance_manager' && alsoCashier ? branchId : null,
        password,
        confirmPassword,
        ...(role === 'investor'
          ? {
              ownershipPercent: Number(ownershipPercent),
              capitalAmountUzs: capitalAmountUzs.replace(/\D/g, ''),
              startPeriodId,
              capitalPaymentMethodCode:
                capitalPaymentMethodCode as InvestorCapitalPaymentMethodCode,
            }
          : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users }),
        queryClient.invalidateQueries({ queryKey: queryKeys.userDirectory }),
      ]);
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (fullName.trim().length < 3) return setError('F.I.Sh. ni kiriting.');
    if (!/^\+998\d{9}$/.test(phone.replace(/\s/g, '')))
      return setError('Telefon +998XXXXXXXXX formatida bo‘lsin.');
    if ((role === 'cashier' || (role === 'finance_manager' && alsoCashier)) && !branchId)
      return setError('Kassir roli uchun filial scope majburiy.');
    if (role === 'investor') {
      const percent = Number(ownershipPercent);
      if (!ownershipPercent.trim() || !Number.isFinite(percent) || percent < 0 || percent > 100)
        return setError('Ulush 0 va 100 foiz orasida bo‘lishi kerak.');
      const capitalDigits = capitalAmountUzs.replace(/\D/g, '');
      if (!capitalDigits || BigInt(capitalDigits) <= 0n)
        return setError('Mablag‘ 0 dan katta bo‘lishi kerak.');
      if (!startPeriodId) return setError('Qo‘shilish oyini tanlang.');
      if (!capitalPaymentMethodCode) return setError('To‘lov shaklini tanlang.');
    }
    if (password.length < 12) return setError('Parol kamida 12 belgidan iborat bo‘lsin.');
    if (password !== confirmPassword) return setError('Parol va tasdiqlash mos emas.');
    setError(null);
    mutation.mutate();
  };
  return (
    <Card title="Yangi foydalanuvchi" className="mb-5">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <FormField label="F.I.Sh." htmlFor="user-full-name" required>
          <Input
            id="user-full-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </FormField>
        <FormField label="Telefon" htmlFor="user-phone" required hint="+998XXXXXXXXX">
          <Input
            id="user-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </FormField>
        <FormField
          label="Parol"
          htmlFor="user-password"
          required
          hint="Kamida 12 belgi‑ xodimga alohida yetkazing"
        >
          <div className="relative">
            <Input
              id="user-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
              aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>
        <FormField label="Parolni tasdiqlang" htmlFor="user-password-confirm" required>
          <Input
            id="user-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </FormField>
        <FormField label="Rol" htmlFor="user-role" required>
          <Select
            id="user-role"
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as RoleCode;
              setRole(nextRole);
              if (nextRole !== 'investor') {
                setOwnershipPercent('');
                setCapitalAmountUzs('');
                setStartPeriodId('');
                setCapitalPaymentMethodCode('');
              }
            }}
          >
            <option value="cashier">Kassir</option>
            <option value="finance_manager">Moliya rahbari</option>
            <option value="director">Direktor</option>
            {canCreateInvestor ? <option value="investor">Investor</option> : null}
          </Select>
        </FormField>
        {role === 'investor' ? (
          <section className="grid gap-4 neu-raised-sm rounded-2xl border-blue-100 p-4 md:col-span-2 md:grid-cols-2 md:p-5">
            <div className="md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                Investor moliyaviy ma’lumotlari
              </p>
              <p className="mt-1 text-sm text-muted">
                Kapital payout emas. Qo‘shilish oyi foyda ulushi hisoblanadigan birinchi davrni
                belgilaydi.
              </p>
            </div>
            <FormField
              label="Kompaniyadagi ulush, %"
              htmlFor="user-ownership"
              required
              hint="Masalan 2. Bu olingan summa foizi emas."
            >
              <Input
                id="user-ownership"
                inputMode="decimal"
                value={ownershipPercent}
                onChange={(event) => setOwnershipPercent(event.target.value)}
              />
            </FormField>
            <FormField
              label="Investor kiritgan mablag‘"
              htmlFor="user-capital"
              required
              hint="Kompaniyaga amalda kiritilgan boshlang‘ich kapital."
            >
              <CurrencyInput
                id="user-capital"
                pattern="[0-9 ]*"
                value={capitalAmountUzs}
                onChange={(event) => setCapitalAmountUzs(formatCapitalInput(event.target.value))}
              />
            </FormField>
            <FormField label="Qo‘shilish oyi" htmlFor="user-investor-start" required>
              <Select
                id="user-investor-start"
                value={startPeriodId}
                onChange={(event) => setStartPeriodId(event.target.value)}
              >
                <option value="">Yil va oyni tanlang</option>
                {[...periods]
                  .sort((a, b) => b.year - a.year || b.month - a.month)
                  .map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.label}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField label="Filial (ixtiyoriy)" htmlFor="user-investor-branch">
              <Select
                id="user-investor-branch"
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Butun kompaniya</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-sm font-semibold text-slate-700">Pul shakli *</legend>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Pul shakli">
                {(
                  [
                    ['CASH', 'Naqd pul'],
                    ['CARD', 'Plastik / Karta'],
                    ['BANK_TRANSFER', 'Bank o‘tkazmasi'],
                  ] as const
                ).map(([code, label]) => {
                  const available = paymentMethods.some(
                    (method) => method.code === code && method.isActive,
                  );
                  const selected = capitalPaymentMethodCode === code;
                  return (
                    <label
                      key={code}
                      className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold transition ${
                        selected
                          ? 'border-primary bg-primary text-[rgb(var(--primary-contrast))] shadow-[var(--neu-pressed)]'
                          : 'border-slate-200 bg-raised text-slate-700 shadow-[var(--neu-shadow-1)] hover:border-blue-300'
                      } ${available ? '' : 'cursor-not-allowed opacity-45'}`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="capital-payment-method"
                        value={code}
                        checked={selected}
                        disabled={!available}
                        onChange={() => setCapitalPaymentMethodCode(code)}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>
        ) : null}
        {role === 'finance_manager' ? (
          <label className="neu-raised-sm flex min-h-11 items-center gap-3 rounded-lg px-3 transition-[box-shadow,border-color] duration-200 has-[:checked]:border-primary/40 has-[:checked]:shadow-[var(--neu-pressed)] py-2">
            <input
              type="checkbox"
              checked={alsoCashier}
              onChange={(event) => setAlsoCashier(event.target.checked)}
            />
            <span className="text-sm font-medium text-ink">
              Filial kassiri rolini ham biriktirish
            </span>
          </label>
        ) : null}
        {role === 'cashier' || (role === 'finance_manager' && alsoCashier) ? (
          <FormField label="Filial scope" htmlFor="user-branch" required>
            <Select
              id="user-branch"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">Tanlang</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {error ? (
          <Alert title="Formani tekshiring" tone="danger" className="md:col-span-2">
            {error}
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert title="User yaratilmadi" tone="danger" className="md:col-span-2">
            {getApiErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            <UserCog className="h-4 w-4" />
            User yaratish
          </Button>
        </div>
      </form>
    </Card>
  );
}
