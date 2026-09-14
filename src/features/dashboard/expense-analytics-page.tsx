import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarDays,
  CreditCard,
  Landmark,
  Layers3,
  ReceiptText,
  Repeat2,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDate, formatMoney, formatPercent, tashkentBusinessDate } from '@/shared/lib/format';
import type { ExpenseAnalytics } from '@/shared/types/domain';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  MoneyText,
  PageHeader,
  Select,
} from '@/shared/ui';

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'previousMonth' | 'custom';

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: isoDate(year, month, 1), to: isoDate(year, month, lastDay) };
}

function presetRange(
  preset: DatePreset,
  period: { year: number; month: number } | undefined,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const today = tashkentBusinessDate();
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const yesterday = shiftDate(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'week') return { from: shiftDate(today, -6), to: today };
  if (preset === 'previousMonth') {
    const [year, month] = today.split('-').map(Number);
    return month === 1 ? monthRange((year ?? 0) - 1, 12) : monthRange(year ?? 0, (month ?? 1) - 1);
  }
  if (preset === 'custom') return { from: customFrom, to: customTo };
  return period ? monthRange(period.year, period.month) : { from: '', to: '' };
}

function MetricCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border/90 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          <p className="mt-3 text-xl font-bold tracking-tight text-ink sm:text-2xl">{value}</p>
          <p className="mt-2 text-xs leading-5 text-muted">{helper}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
          {icon}
        </span>
      </div>
    </div>
  );
}

function PlanComparison({ data }: { data: ExpenseAnalytics['planComparison'] }) {
  const variance = BigInt(data.varianceUzs);
  const isUnderPlan = variance >= 0n;
  const difference = (isUnderPlan ? variance : -variance).toString();
  const progress = Math.max(0, Math.min(data.completionPct ?? 0, 100));

  return (
    <section className="mb-6 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 p-6 text-white shadow-elevated sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-blue-100">
            <Target className="h-4 w-4" aria-hidden="true" />
            Reja va fakt
          </div>
          <h2 className="mt-4 text-xl font-bold">Jami xarajatlar holati</h2>
          <p className="mt-1 text-sm text-blue-100">
            {data.periodLabel} uchun kiritilgan xarajat rejasi va amaldagi natija
          </p>
        </div>
        <span className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold">
          Bajarilish {formatPercent(data.completionPct)}
        </span>
      </div>

      {!data.hasPlan ? (
        <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-blue-50">
          Tanlangan davr uchun xarajat rejasi kiritilmagan.
        </div>
      ) : (
        <>
          <dl className="mt-7 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-blue-200">
                Xarajat rejasi
              </dt>
              <dd className="mt-2 text-xl font-bold tabular-nums">
                <MoneyText value={data.plannedAmountUzs} />
              </dd>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-blue-200">
                Jami xarajat
              </dt>
              <dd className="mt-2 text-xl font-bold tabular-nums">
                <MoneyText value={data.actualAmountUzs} />
              </dd>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-200">
                {isUnderPlan ? (
                  <TrendingDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                )}
                {isUnderPlan ? 'Rejagacha yetmagan' : 'Rejadan oshgan'}
              </dt>
              <dd className="mt-2 text-xl font-bold tabular-nums">
                <MoneyText value={difference} />
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs font-semibold text-blue-100">
              <span>Reja bajarilishi</span>
              <span>{formatPercent(data.completionPct)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function AnalyticsContent({ data }: { data: ExpenseAnalytics }) {
  return (
    <>
      <PlanComparison data={data.planComparison} />

      <section
        aria-label="Xarajatlar umumiy ko‘rsatkichlari"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <MetricCard
          title="Jami xarajatlar"
          value={formatMoney(data.summary.totalAmountUzs)}
          helper={`${data.summary.transactionCount} ta tasdiqlangan operatsiya`}
          icon={<ReceiptText className="h-5 w-5" />}
        />
        <MetricCard
          title="Doimiy xarajatlar"
          value={formatMoney(data.summary.fixed.amountUzs)}
          helper={`${formatPercent(data.summary.fixed.sharePct)} · ${data.summary.fixed.transactionCount} ta`}
          icon={<Layers3 className="h-5 w-5" />}
        />
        <MetricCard
          title="O‘zgaruvchan xarajatlar"
          value={formatMoney(data.summary.variable.amountUzs)}
          helper={`${formatPercent(data.summary.variable.sharePct)} · ${data.summary.variable.transactionCount} ta`}
          icon={<Repeat2 className="h-5 w-5" />}
        />
        {data.paymentMethods.map((item, index) => (
          <MetricCard
            key={item.id}
            title={item.name}
            value={formatMoney(item.amountUzs)}
            helper={`${formatPercent(item.sharePct)} · ${item.transactionCount} ta`}
            icon={
              index % 3 === 0 ? (
                <Banknote className="h-5 w-5" />
              ) : index % 3 === 1 ? (
                <CreditCard className="h-5 w-5" />
              ) : (
                <Landmark className="h-5 w-5" />
              )
            }
          />
        ))}
      </section>

      <section
        aria-label="Filiallar bo‘yicha xarajatlar"
        className="mt-6 grid gap-4 lg:grid-cols-2"
      >
        {data.branches.map((branch) => (
          <Card key={branch.branchId} className="h-full">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-primary">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-ink">{branch.branchName}</h2>
                <p className="text-xs text-muted">{branch.transactionCount} ta xarajat</p>
              </div>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold text-muted">Doimiy</dt>
                <dd className="mt-1 font-bold">
                  <MoneyText value={branch.fixedAmountUzs} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted">O‘zgaruvchan</dt>
                <dd className="mt-1 font-bold">
                  <MoneyText value={branch.variableAmountUzs} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted">Jami</dt>
                <dd className="mt-1 font-bold text-primary">
                  <MoneyText value={branch.totalAmountUzs} />
                </dd>
              </div>
            </dl>
            <div className="mt-5 border-t border-border pt-4">
              {branch.paymentMethods.map((method) => (
                <div key={method.id} className="flex justify-between gap-3 py-1.5 text-sm">
                  <span className="text-muted">{method.name}</span>
                  <MoneyText value={method.amountUzs} className="font-semibold" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card
          title="Top xarajat kategoriyalari"
          description="Tanlangan filtrdagi eng katta 8 kategoriya"
        >
          <ol className="space-y-4">
            {data.categories.map((category, index) => (
              <li key={category.categoryId}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink">
                    {index + 1}. {category.categoryNameSnapshot}
                  </span>
                  <span className="font-bold">
                    <MoneyText value={category.amountUzs} />
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted">
                  <span>
                    {category.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'} ·{' '}
                    {category.transactionCount} ta
                  </span>
                  <span>{formatPercent(category.sharePct)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(category.sharePct ?? 0, 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card
          title="So‘nggi xarajatlar"
          description="Tanlangan filtrdagi oxirgi 10 ta tasdiqlangan xarajat"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th className="px-3 py-3">Sana</th>
                  <th className="px-3 py-3">Xarajat</th>
                  <th className="px-3 py-3">Kategoriya</th>
                  <th className="px-3 py-3">Filial</th>
                  <th className="px-3 py-3">Turi</th>
                  <th className="px-3 py-3">To‘lov</th>
                  <th className="px-3 py-3 text-right">Summa</th>
                </tr>
              </thead>
              <tbody>
                {data.recentExpenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-border/80">
                    <td className="px-3 py-3">{formatDate(expense.transactionDate)}</td>
                    <td className="max-w-[220px] truncate px-3 py-3 font-medium">
                      {expense.description}
                    </td>
                    <td className="px-3 py-3">{expense.categoryNameSnapshot}</td>
                    <td className="px-3 py-3">{expense.branchName}</td>
                    <td className="px-3 py-3">
                      {expense.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                    </td>
                    <td className="px-3 py-3">{expense.paymentMethodName}</td>
                    <td className="px-3 py-3 text-right font-bold">
                      <MoneyText value={expense.amountUzs} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </>
  );
}

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
