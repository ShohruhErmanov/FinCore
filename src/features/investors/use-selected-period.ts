import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export interface SelectedPeriod {
  year: number;
  /** null = tepa panelda oy tanlanmagan; sahifa butun yilni ko'rsatadi. */
  month: number | null;
  /** Tanlangan davr id'si — to'lov so'rovi aynan shu davrga yoziladi. */
  periodId: string | null;
}

/**
 * Yil va oy tepa paneldan keladi: panel tanlovni ?period=<id> sifatida
 * chiqaradi, davr qatori esa yil va oyni olib yuradi.
 *
 * Investor sahifalari orasida ulashilgan — nusxalanmagan: sahifa o'z Yil/Oy
 * juftini qo'ysa, panel bilan ikkisi boshqa davrni ko'rsatishi mumkin bo'lardi,
 * va aynan shu xato PHASE 48 dan keyin tuzatilgan edi.
 */
export function useSelectedPeriod(): SelectedPeriod {
  const [searchParams] = useSearchParams();
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 300_000,
  });
  const selected = periodsQuery.data?.find((period) => period.id === searchParams.get('period'));
  return {
    year: selected?.year ?? new Date().getFullYear(),
    month: selected?.month ?? null,
    periodId: selected?.id ?? null,
  };
}
