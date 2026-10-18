import { useQuery } from '@tanstack/react-query';
import { adminApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import type { Branch, ExpenseCategory, MasterItem } from '@/shared/types/domain';

export type SettingKind = 'categories' | 'departments' | 'payment-methods' | 'branches';

export type SettingRow = (ExpenseCategory | MasterItem | Branch) & { id: string };

export const SETTING_META: Record<
  SettingKind,
  { title: string; singular: string; description: string }
> = {
  categories: {
    title: 'Xarajat kategoriyalari',
    singular: 'kategoriya',
    description: 'Kategoriya turi server-derived snapshot sifatida moliyaviy yozuvlarda saqlanadi.',
  },
  departments: {
    title: 'Bo‘limlar',
    singular: 'bo‘lim',
    description: 'Xarajatning tashkiliy kesimi uchun canonical master-data.',
  },
  'payment-methods': {
    title: 'To‘lov usullari',
    singular: 'to‘lov usuli',
    description: 'Xarajat va tushum kanallari uchun immutable ID’li lug‘at.',
  },
  branches: {
    title: 'Filiallar',
    singular: 'filial',
    description: 'Filial ro‘yxati. “Barchasi” — filtr, filial emas.',
  },
};

/**
 * The four reference lists the Excel "Sozlamalar" sheet keeps side by side.
 * They live on separate routes here, so a tab strip keeps them one section
 * rather than four unrelated pages.
 */
export const SETTING_TABS: Array<{ kind: SettingKind; label: string; to: string }> = [
  { kind: 'categories', label: 'Xarajat kategoriyalari', to: routes.categories },
  { kind: 'departments', label: 'Bo‘limlar', to: routes.departments },
  { kind: 'payment-methods', label: 'To‘lov usullari', to: routes.paymentMethods },
  { kind: 'branches', label: 'Filiallar', to: routes.branches },
];

export function useSettingData(kind: SettingKind) {
  return useQuery({
    queryKey: queryKeys.master(kind),
    queryFn: ({ signal }) =>
      kind === 'categories'
        ? referenceApi.categories(signal)
        : kind === 'departments'
          ? referenceApi.departments(signal)
          : kind === 'payment-methods'
            ? referenceApi.paymentMethods(signal)
            : adminApi.allBranches(signal),
    enabled: kind !== 'categories',
    staleTime: 120_000,
  });
}
