import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { authApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';

const money = z.string().regex(/^\d+$/, 'Faqat butun so‘m kiriting.');

export const revenueFormSchema = z
  .object({
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sanani YYYY-MM-DD formatida kiriting.'),
    branchId: z.string().optional(),
    cashUzs: money,
    cardUzs: money,
    transferUzs: money,
    comment: z.string().max(500, '500 belgidan oshmasin.').optional(),
    editReason: z.string().max(500, '500 belgidan oshmasin.').optional(),
  })
  .refine(
    (values) =>
      BigInt(values.cashUzs || '0') +
        BigInt(values.cardUzs || '0') +
        BigInt(values.transferUzs || '0') >
      0n,
    { message: 'Kunlik jami tushum 0 dan katta bo‘lishi kerak.', path: ['cashUzs'] },
  );

export type RevenueFormValues = z.infer<typeof revenueFormSchema>;

export function totalOf(
  values: Pick<RevenueFormValues, 'cashUzs' | 'cardUzs' | 'transferUzs'>,
): string {
  return (
    BigInt(values.cashUzs || '0') +
    BigInt(values.cardUzs || '0') +
    BigInt(values.transferUzs || '0')
  ).toString();
}

export function useRevenueReferences() {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });
  const branches = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
    staleTime: 300_000,
  });
  const periods = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  return { me, branches, periods };
}
