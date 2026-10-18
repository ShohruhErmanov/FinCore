import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/shared/api/client';
import { authApi, referenceApi, revenueApi } from '@/shared/api/contracts';
import { invalidateRevenueAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { downloadCsv } from '@/shared/lib/csv';
import { formatDateTime, tashkentBusinessDate } from '@/shared/lib/format';
import type { RevenuePlanBoard } from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CurrencyInput,
  ErrorState,
  LoadingState,
  LockedNotice,
  MoneyText,
  PageHeader,
  PercentText,
  VarianceText,
} from '@/shared/ui';
import { RevenuePlanYearOverview } from './revenue-plan-year';

export function RevenuePlanPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // Top-bar branch narrows the board; saving still sends every branch.
  const planBranch = searchParams.get('branch') ?? 'all';
  const [drafts, setDrafts] = useState<Record<string, string | null>>({});
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const currentBusinessDate = tashkentBusinessDate();
  const currentYear = Number(currentBusinessDate.slice(0, 4));
  const currentMonth = Number(currentBusinessDate.slice(5, 7));
  const selectedPeriodId =
    searchParams.get('period') ??
    periodsQuery.data?.find(
      (period) => period.year === currentYear && period.month === currentMonth,
    )?.id ??
    periodsQuery.data?.find((period) => period.status === 'open')?.id ??
    periodsQuery.data?.[0]?.id ??
    '';
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === selectedPeriodId);
  const planQuery = useQuery({
    queryKey: queryKeys.revenuePlan(selectedPeriodId),
    queryFn: ({ signal }) => revenueApi.plan(selectedPeriodId, signal),
    enabled: Boolean(selectedPeriodId),
  });

  useEffect(() => {
    if (!searchParams.get('period') && selectedPeriodId) {
      const next = new URLSearchParams(searchParams);
      next.set('period', selectedPeriodId);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedPeriodId, setSearchParams]);

  useEffect(() => {
    if (planQuery.data)
      setDrafts(
        Object.fromEntries(
          planQuery.data.lines.map((line) => [line.branchId, line.plannedAmountUzs]),
        ),
      );
  }, [planQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      revenueApi.savePlan(
        selectedPeriodId,
        Object.entries(drafts).map(([branchId, plannedAmountUzs]) => ({
          branchId,
          plannedAmountUzs: plannedAmountUzs === '' ? null : plannedAmountUzs,
        })),
      ),
    onSuccess: async (updated: RevenuePlanBoard) => {
      queryClient.setQueryData(queryKeys.revenuePlan(updated.periodId), updated);
      await invalidateRevenueAggregates(queryClient);
    },
  });

  const canEdit =
    Boolean(meQuery.data?.permissions.includes('revenue_plan.manage')) &&
    selectedPeriod?.status === 'open';

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Rejalashtirish' }, { label: 'Tushum rejasi', current: true }]}
      />
      <PageHeader
        title="Tushum rejasi"
        description="Filial bo‘yicha oylik tushum rejasi. Kunlik va haftalik reja shu summadan avtomatik bo‘linadi."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!planQuery.data?.lines.length}
              onClick={() =>
                planQuery.data &&
                downloadCsv(
                  `tushum-rejasi-${planQuery.data.periodLabel.replace(/\s+/g, '-').toLowerCase()}`,
                  [
                    [
                      'Davr',
                      'Filial',
                      'Oylik reja',
                      'Kunlik reja',
                      'Amalda',
                      'Farq',
                      'Bajarilish %',
                    ],
                    ...planQuery.data.lines.map((line) => [
                      planQuery.data.periodLabel,
                      line.branchName,
                      line.plannedAmountUzs,
                      line.dailyPlanUzs,
                      line.actualAmountUzs,
                      line.varianceUzs,
                      line.completionPercent,
                    ]),
                  ],
                )
              }
            >
              <Download className="h-4 w-4" /> CSV yuklab olish
            </Button>
            {canEdit ? (
              <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save className="h-4 w-4" /> Saqlash
              </Button>
            ) : null}
          </>
        }
      />

      {selectedPeriod?.status === 'closed' ? (
        <LockedNotice>Yopilgan davr rejasi tahrirlanmaydi, faqat ko‘rish mumkin.</LockedNotice>
      ) : null}
      {saveMutation.error ? (
        <Alert title="Saqlanmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(saveMutation.error)}
        </Alert>
      ) : null}

      {planQuery.isLoading ? <LoadingState label="Tushum rejasi yuklanmoqda…" /> : null}
      {planQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(planQuery.error)}
          onRetry={() => void planQuery.refetch()}
        />
      ) : null}
      {planQuery.data ? (
        <>
          <Card
            title={`${planQuery.data.periodLabel} · filiallar rejasi`}
            description={`Oyda ${planQuery.data.daysInMonth} kun. Kunlik reja = oylik reja ÷ ${planQuery.data.daysInMonth}.`}
            className="overflow-hidden"
          >
            <div className="-m-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <caption className="sr-only">{planQuery.data.periodLabel} tushum rejasi</caption>
                <thead>
                  <tr className="border-b border-border bg-canvas/70 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">Filial</th>
                    <th className="px-4 py-3 text-right">Oylik reja</th>
                    <th className="px-4 py-3 text-right">Kunlik reja</th>
                    <th className="px-4 py-3 text-right">Amalda</th>
                    <th className="px-4 py-3 text-right">Farq</th>
                    <th className="px-4 py-3 text-right">Bajarilish</th>
                  </tr>
                </thead>
                <tbody>
                  {planQuery.data.lines
                    .filter((line) => planBranch === 'all' || line.branchId === planBranch)
                    .map((line) => {
                      const draft = drafts[line.branchId] ?? null;
                      const dailyPlan =
                        draft === null || draft === ''
                          ? null
                          : (BigInt(draft) / BigInt(planQuery.data.daysInMonth)).toString();
                      const variance =
                        draft === null || draft === ''
                          ? null
                          : (BigInt(draft) - BigInt(line.actualAmountUzs)).toString();
                      return (
                        <tr key={line.id} className="border-b border-border last:border-0">
                          <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                            {line.branchName}
                          </th>
                          <td className="min-w-52 px-4 py-3 text-right">
                            {canEdit ? (
                              <CurrencyInput
                                aria-label={`${line.branchName} oylik tushum rejasi`}
                                value={draft ?? ''}
                                placeholder="0"
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (/^\d*$/.test(nextValue))
                                    setDrafts((current) => ({
                                      ...current,
                                      [line.branchId]:
                                        nextValue === '' ? '' : nextValue.replace(/^0+(?=\d)/, ''),
                                    }));
                                }}
                              />
                            ) : (
                              <MoneyText value={draft} className="font-semibold text-ink" />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                            <MoneyText value={dailyPlan} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                            <MoneyText value={line.actualAmountUzs} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {variance === null ? (
                              <span className="text-sm text-muted">—</span>
                            ) : (
                              <VarianceText value={variance} />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                            <PercentText value={line.completionPercent} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
          <Alert title="Kunlik va haftalik reja avtomatik" tone="info" className="mt-5">
            Oylik reja kiritilgach, kunlik reja teng bo‘linadi (qoldiqsiz), haftalik reja esa shu
            kunlik rejalar yig‘indisi bo‘ladi. Dashboard diagrammasida uchala kesim ham ko‘rinadi.
            Oxirgi saqlash: {planQuery.data.updatedByName} ·{' '}
            {formatDateTime(planQuery.data.updatedAt)}.
          </Alert>
        </>
      ) : null}
      {selectedPeriod ? (
        <RevenuePlanYearOverview
          year={selectedPeriod.year}
          branchId={planBranch}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={(periodId) => {
            const next = new URLSearchParams(searchParams);
            next.set('period', periodId);
            setSearchParams(next, { replace: true });
            // Whichever ancestor scrolls, bring the board with the month back into view.
            document
              .getElementById('main-content')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      ) : null}
    </div>
  );
}
