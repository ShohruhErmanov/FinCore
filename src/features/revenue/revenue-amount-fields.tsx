import { useForm } from 'react-hook-form';
import { formatMoney } from '@/shared/lib/format';
import { CurrencyInput, FormField, Input } from '@/shared/ui';
import type { RevenueFormValues } from './revenue-form';

export function RevenueAmountFields({
  register,
  errors,
  total,
  prefix,
}: {
  register: ReturnType<typeof useForm<RevenueFormValues>>['register'];
  errors: ReturnType<typeof useForm<RevenueFormValues>>['formState']['errors'];
  total: string;
  prefix: string;
}) {
  return (
    <>
      <FormField
        label="Naqd pul"
        htmlFor={`${prefix}-cash`}
        required
        error={errors.cashUzs?.message}
      >
        <CurrencyInput id={`${prefix}-cash`} {...register('cashUzs')} />
      </FormField>
      <FormField
        label="Plastik karta"
        htmlFor={`${prefix}-card`}
        required
        error={errors.cardUzs?.message}
      >
        <CurrencyInput id={`${prefix}-card`} {...register('cardUzs')} />
      </FormField>
      <FormField
        label="Bank o‘tkazmasi"
        htmlFor={`${prefix}-transfer`}
        required
        error={errors.transferUzs?.message}
      >
        <CurrencyInput id={`${prefix}-transfer`} {...register('transferUzs')} />
      </FormField>
      <FormField
        label="Kunlik jami (hisoblanadi)"
        htmlFor={`${prefix}-total`}
        hint="Uch kanal yig‘indisi; serverda qayta hisoblanadi."
      >
        <Input id={`${prefix}-total`} readOnly value={formatMoney(total)} />
      </FormField>
    </>
  );
}
