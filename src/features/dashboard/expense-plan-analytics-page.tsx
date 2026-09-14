import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingState,
  MoneyText,
  PageHeader,
} from '@/shared/ui';

export function ExpensePlanAnalyticsPage() {
  const [searchParams] = useSearchParams();
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
  });
  const period =
    searchParams.get('period') ??
    periodsQuery.data?.find((item) => item.status === 'open')?.id ??
    '';
  const branch = searchParams.get('branch') ?? 'all';
  const analyticsQuery = useQuery({
    queryKey: queryKeys.expensePlanAnalytics(period, branch),
    queryFn: ({ signal }) => reportApi.expensePlan({ period, branch }, signal),
    enabled: Boolean(period),
  });

  if (periodsQuery.isLoading || analyticsQuery.isLoading)
    return <LoadingState label="Xarajatlar rejasi yuklanmoqda…" />;

  if (periodsQuery.isError || analyticsQuery.isError)
    return (
      <ErrorState
        message="Xarajatlar ma’lumotlarini yuklab bo‘lmadi."
        onRetry={() => void Promise.all([periodsQuery.refetch(), analyticsQuery.refetch()])}
      />
    );

  if (!period || !analyticsQuery.data)
    return (
      <EmptyState
        title="Hisob davri mavjud emas"
        description="Analytics uchun hisob davri topilmadi."
      />
    );

  const data = analyticsQuery.data;
  const scopeLabel =
    data.branchFilter === 'all'
      ? 'Barcha ruxsat etilgan filiallar'
      : (data.branches[0]?.branchName ?? 'Tanlangan filial');

  return (
    <div>
      <PageHeader
        title="Xarajatlar rejasi"
        description={`${data.period.label} · ${scopeLabel} bo‘yicha tasdiqlangan budjet tahlili.`}
        actions={
          <Link to={`${routes.dashboard}?period=${period}&branch=${branch}`}>
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Dashboardga qaytish
            </Button>
          </Link>
        }
      />

      {!data.hasPlan ? (
        <EmptyState
          title="Xarajat rejasi mavjud emas"
          description="Tanlangan davr uchun tasdiqlangan xarajat rejasi topilmadi."
        />
      ) : (
        <>
          <section
            aria-label="Xarajat rejasi umumiy ko‘rsatkichlari"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard
              label="Jami xarajat rejasi"
              value={<MoneyText value={data.summary.totalPlanUzs} />}
              helper={`${data.summary.branchCount} ta filial bo‘yicha jami`}
              tone="info"
            />
            <KpiCard
              label="Doimiy xarajatlar"
              value={<MoneyText value={data.summary.fixedPlanUzs} />}
              helper="Budjetdagi doimiy tur snapshotlari"
            />
            <KpiCard
              label="O‘zgaruvchan xarajatlar"
              value={<MoneyText value={data.summary.variablePlanUzs} />}
              helper="Budjetdagi o‘zgaruvchan tur snapshotlari"
            />
            <KpiCard
              label="Filiallar soni"
              value={data.summary.branchCount}
              helper="Joriy o‘qish scope’idagi faol filiallar"
            />
          </section>

          <section aria-label="Filiallar xarajat rejasi" className="mt-6 grid gap-4 lg:grid-cols-2">
            {data.branches.map((item) => (
              <Card key={item.branchId} className="h-full">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-primary">
                    <Building2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-bold text-ink">{item.branchName}</h2>
                    <p className="text-xs text-muted">Filial xarajat rejasi</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold text-muted">Doimiy</dt>
                    <dd className="mt-1 font-bold text-ink">
                      <MoneyText value={item.fixedPlanUzs} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted">O‘zgaruvchan</dt>
                    <dd className="mt-1 font-bold text-ink">
                      <MoneyText value={item.variablePlanUzs} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted">Jami</dt>
                    <dd className="mt-1 font-bold text-primary">
                      <MoneyText value={item.totalPlanUzs} />
                    </dd>
                  </div>
                </dl>
              </Card>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
