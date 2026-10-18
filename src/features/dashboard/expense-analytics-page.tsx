import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDate } from '@/shared/lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from '@/shared/ui';
import { type DatePreset, monthRange, presetRange } from './expense-analytics-range';
import { AnalyticsContent } from './expense-analytics-content';

export function ExpenseAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
  });
  const periodId =
    searchParams.get('period') ??
    periodsQuery.data?.find((item) => item.status === 'open')?.id ??
    '';
  const period = periodsQuery.data?.find((item) => item.id === periodId);
  const branch = searchParams.get('branch') ?? 'all';
  const preset = (searchParams.get('range') as DatePreset | null) ?? 'month';
  const fallbackRange = period ? monthRange(period.year, period.month) : { from: '', to: '' };
  const customFrom = searchParams.get('dateFrom') ?? fallbackRange.from;
  const customTo = searchParams.get('dateTo') ?? fallbackRange.to;
  const range = useMemo(
    () => presetRange(preset, period, customFrom, customTo),
    [preset, period, customFrom, customTo],
  );
  const analyticsQuery = useQuery({
    queryKey: queryKeys.expenseAnalytics(periodId, range.from, range.to, branch),
    queryFn: ({ signal }) =>
      reportApi.expenseAnalytics(
        { period: periodId, from: range.from, to: range.to, branch },
        signal,
      ),
    enabled: Boolean(range.from && range.to && range.from <= range.to),
  });
  const updateParam = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(name, value);
    setSearchParams(next, { replace: true });
  };

  if (periodsQuery.isLoading) return <LoadingState label="Xarajatlar dashboardi yuklanmoqda…" />;
  if (periodsQuery.isError)
    return (
      <ErrorState
        message="Hisob davrlarini yuklab bo‘lmadi."
        onRetry={() => void periodsQuery.refetch()}
      />
    );
  if (!period)
    return (
      <EmptyState
        title="Hisob davri mavjud emas"
        description="Analytics uchun hisob davri topilmadi."
      />
    );

  return (
    <div>
      <PageHeader
        title="Xarajatlar"
        description="Barcha xarajatlar statistikasi va filiallar kesimidagi tahlil"
        actions={
          <Link to={`${routes.dashboard}?period=${periodId}&branch=${branch}`}>
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Dashboardga qaytish
            </Button>
          </Link>
        }
      />
      <Card
        title="Sana filtri"
        description="Filial tanlovi tepadagi yagona global filtrdan olinadi"
        actions={
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
            <CalendarDays className="h-4 w-4" />
            {range.from && range.to
              ? `${formatDate(range.from)} — ${formatDate(range.to)}`
              : 'Sana tanlanmagan'}
          </span>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="Davr" htmlFor="expense-date-preset">
            <Select
              id="expense-date-preset"
              value={preset}
              onChange={(event) => updateParam('range', event.target.value)}
            >
              <option value="today">Bugun</option>
              <option value="yesterday">Kecha</option>
              <option value="week">Oxirgi 7 kun</option>
              <option value="month">Ushbu oy</option>
              <option value="previousMonth">O‘tgan oy</option>
              <option value="custom">Ixtiyoriy sana</option>
            </Select>
          </FormField>
          {preset === 'custom' ? (
            <>
              <FormField label="Boshlanish sanasi" htmlFor="expense-date-from">
                <Input
                  id="expense-date-from"
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(event) => updateParam('dateFrom', event.target.value)}
                />
              </FormField>
              <FormField label="Tugash sanasi" htmlFor="expense-date-to">
                <Input
                  id="expense-date-to"
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(event) => updateParam('dateTo', event.target.value)}
                />
              </FormField>
            </>
          ) : null}
        </div>
      </Card>

      <div className="mt-6">
        {range.from > range.to ? (
          <ErrorState message="Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas." />
        ) : analyticsQuery.isLoading ? (
          <LoadingState label="Xarajatlar tahlili yuklanmoqda…" />
        ) : analyticsQuery.isError ? (
          <ErrorState
            message="Xarajatlar ma’lumotlarini yuklab bo‘lmadi."
            onRetry={() => void analyticsQuery.refetch()}
          />
        ) : !analyticsQuery.data?.hasData && !analyticsQuery.data?.planComparison.hasPlan ? (
          <EmptyState
            title="Ushbu davr uchun xarajatlar topilmadi"
            description="Tanlangan sana va filial bo‘yicha tasdiqlangan xarajat mavjud emas."
          />
        ) : (
          <AnalyticsContent data={analyticsQuery.data} />
        )}
      </div>
    </div>
  );
}
