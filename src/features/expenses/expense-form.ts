import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { authApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const expenseFormSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sanani YYYY-MM-DD formatida kiriting.'),
  branchId: z.string().optional(),
  categoryId: z.string().min(1, 'Kategoriyani tanlang.'),
  description: z
    .string()
    .trim()
    .min(3, 'Kamida 3 ta belgi kiriting.')
    .max(500, '500 belgidan oshmasin.'),
  amountUzs: z
    .string()
    .regex(/^\d+$/, 'Faqat butun so‘m kiriting.')
    .refine((value) => BigInt(value) > 0n, 'Summa 0 dan katta bo‘lishi kerak.'),
  paymentMethodId: z.string().min(1, 'To‘lov usulini tanlang.'),
  departmentId: z.string().min(1, 'Bo‘limni tanlang.'),
  responsibleUserId: z.string().min(1, 'Mas’ul xodimni tanlang.'),
  editReason: z.string().max(500, '500 belgidan oshmasin.').optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export function useExpenseReferences() {
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
  const categories = useQuery({
    queryKey: queryKeys.master('categories'),
    queryFn: ({ signal }) => referenceApi.categories(signal),
    staleTime: 300_000,
  });
  const departments = useQuery({
    queryKey: queryKeys.master('departments'),
    queryFn: ({ signal }) => referenceApi.departments(signal),
    staleTime: 300_000,
  });
  const paymentMethods = useQuery({
    queryKey: queryKeys.master('payment-methods'),
    queryFn: ({ signal }) => referenceApi.paymentMethods(signal),
    staleTime: 300_000,
  });
  const users = useQuery({
    queryKey: queryKeys.userDirectory,
    queryFn: ({ signal }) => referenceApi.users(signal),
    staleTime: 60_000,
  });
  return { me, branches, periods, categories, departments, paymentMethods, users };
}
