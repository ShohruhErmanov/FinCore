import { cn } from '@/shared/lib/cn';
import type { BranchComparisonReport, MonthlyReport } from '@/shared/types/domain';
import { EmptyState } from '@/shared/ui';
import { buildMonthlyExecutiveSummary } from './monthly-report';
import { Overview, RevenueProfitBar } from './monthly-report-overview';
import { Branches, Composition } from './monthly-report-breakdown';
import { Trend } from './monthly-report-trend';
import { CategoryTable, Exceptions, TopExpenses } from './monthly-report-categories';
import { surface } from './monthly-report-format';

export function MonthlyReportDashboard({
  report,
  comparison,
  month,
}: {
  report: MonthlyReport;
  comparison: BranchComparisonReport;
  month: number;
}) {
  const summary = buildMonthlyExecutiveSummary(report, month);
  if (comparison.selectedMonth.month !== month || comparison.year !== report.year)
    return (
      <EmptyState
        title="Hisobot davrlari mos kelmadi"
        description="Oylik va filiallar ma’lumotlari bir xil davr uchun olinmadi."
      />
    );
  const active = summary.categories.filter(
    (item) =>
      item.planActual.hasPlan ||
      BigInt(item.planActual.actualAmountUzs) !== 0n ||
      item.transactionCount > 0,
  );
  const financial = report.financialMonths?.find((item) => item.month === month);
  const hasFinancialData =
    financial !== undefined &&
    (financial.revenuePlanUzs !== null ||
      BigInt(financial.revenueActualUzs) !== 0n ||
      BigInt(financial.expenseActualUzs) !== 0n);
  if (!active.length && !hasFinancialData)
    return (
      <EmptyState
        title="Bu oy uchun ma’lumot mavjud emas"
        description="Tanlangan davr va filialda reja ham, xarajat ham qayd etilmagan."
      />
    );
  const branchTotal = comparison.selectedMonth.total.expense;
  if (
    BigInt(branchTotal.actualAmountUzs) !== BigInt(summary.overall.actualAmountUzs) ||
    BigInt(branchTotal.plannedAmountUzs ?? '0') !== BigInt(summary.overall.plannedAmountUzs ?? '0')
  )
    return (
      <EmptyState
        title="Hisobot manbalari mos kelmadi"
        description="Kategoriya va filial jami bir xil emas. Moliyaviy natijani ko‘rsatishdan oldin server ma’lumotlarini tekshiring."
      />
    );
  return (
    <div className="min-w-0 space-y-8 pb-8">
      <Overview summary={summary} year={report.year} />
      {financial ? <RevenueProfitBar data={financial} /> : null}
      <Composition summary={summary} />
      <Branches comparison={comparison} />
      <Trend comparison={comparison} selectedMonth={month} />
      <Exceptions categories={active} />
      <TopExpenses categories={active} />
      <section
        aria-label="Kategoriyalar bo‘yicha batafsil hisobot"
        className={cn(surface, 'overflow-hidden p-4 sm:p-5')}
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Xarajatlar kategoriyalar bo‘yicha
            </h2>
            <p className="text-xs text-slate-500">
              Tanlangan oydagi reja, fakt, farq va bajarilish
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">{active.length} ta kategoriya</span>
        </div>
        <CategoryTable categories={active} />
      </section>
    </div>
  );
}

export function MonthlyReportSkeleton() {
  return (
    <div role="status" aria-label="Oylik hisobot yuklanmoqda" className="animate-pulse space-y-5">
      <span className="sr-only">Oylik hisobot yuklanmoqda…</span>
      <div className="h-72 neu-inset rounded-[1.5rem]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 neu-inset rounded-[1.5rem]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-52 neu-inset rounded-[1.5rem]" />
        <div className="h-52 neu-inset rounded-[1.5rem]" />
      </div>
    </div>
  );
}
