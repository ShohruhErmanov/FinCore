import {
  Banknote,
  Building2,
  CreditCard,
  Landmark,
  Layers3,
  ReceiptText,
  Repeat2,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { formatDate, formatMoney, formatPercent } from '@/shared/lib/format';
import type { ExpenseAnalytics } from '@/shared/types/domain';
import { Card, MoneyText, ProgressBar } from '@/shared/ui';

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
    <div className="neu-raised rounded-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          <p className="mt-3 text-xl font-bold tracking-tight text-ink sm:text-2xl">{value}</p>
          <p className="mt-2 text-xs leading-5 text-muted">{helper}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center neu-raised-sm rounded-xl text-primary">
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

  return (
    <section className="neu-hero mb-6 overflow-hidden rounded-[1.5rem] border border-border/70 p-6 text-ink sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="neu-inset inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            <Target className="h-4 w-4" aria-hidden="true" />
            Reja va fakt
          </div>
          <h2 className="mt-4 text-xl font-bold">Jami xarajatlar holati</h2>
          <p className="mt-1 text-sm text-muted">
            {data.periodLabel} uchun kiritilgan xarajat rejasi va amaldagi natija
          </p>
        </div>
        <span className="neu-inset rounded-xl px-4 py-2 text-sm font-bold">
          Bajarilish {formatPercent(data.completionPct)}
        </span>
      </div>

      {!data.hasPlan ? (
        <div className="neu-inset mt-6 rounded-2xl p-4 text-sm text-muted">
          Tanlangan davr uchun xarajat rejasi kiritilmagan.
        </div>
      ) : (
        <>
          <dl className="mt-7 grid gap-4 sm:grid-cols-3">
            <div className="neu-inset rounded-2xl p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Xarajat rejasi
              </dt>
              <dd className="mt-2 text-xl font-bold tabular-nums">
                <MoneyText value={data.plannedAmountUzs} />
              </dd>
            </div>
            <div className="neu-inset rounded-2xl p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Jami xarajat
              </dt>
              <dd className="mt-2 text-xl font-bold tabular-nums">
                <MoneyText value={data.actualAmountUzs} />
              </dd>
            </div>
            <div className="neu-inset rounded-2xl p-4">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
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
            <div className="mb-2 flex justify-between text-xs font-semibold text-muted">
              <span>Reja bajarilishi</span>
              <span>{formatPercent(data.completionPct)}</span>
            </div>
            <ProgressBar value={data.completionPct} className="h-2.5" />
          </div>
        </>
      )}
    </section>
  );
}

export function AnalyticsContent({ data }: { data: ExpenseAnalytics }) {
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
              <span className="grid h-10 w-10 place-items-center neu-raised-sm rounded-xl text-primary">
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
                <ProgressBar value={category.sharePct} className="mt-2 h-1.5" />
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
                <tr className="border-b border-border bg-canvas/70">
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
