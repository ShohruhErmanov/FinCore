import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthlyReportPage } from '@/features/reports/FinancialReportPages';
import { buildMonthlyExecutiveSummary } from '@/features/reports/monthly-report';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import type { BranchComparisonReport, MonthlyReport, PlanActual } from '@/shared/types/domain';

vi.mock('@/shared/api/contracts', () => ({
  referenceApi: { periods: vi.fn() },
  reportApi: { monthly: vi.fn(), branchComparison: vi.fn() },
}));

const AUGUST = '20000000-0000-4000-8000-000000000008';
const JULY = '20000000-0000-4000-8000-000000000007';
const SAYXUN = '10000000-0000-4000-8000-000000000001';
const XALQLAR = '10000000-0000-4000-8000-000000000002';

function plan(planned: string | null, actual: string): PlanActual {
  const plannedValue = planned === null ? null : BigInt(planned);
  const actualValue = BigInt(actual);
  return {
    hasPlan: planned !== null,
    plannedAmountUzs: planned,
    actualAmountUzs: actual,
    varianceUzs: plannedValue === null ? null : (plannedValue - actualValue).toString(),
    completionPercent:
      plannedValue === null || plannedValue === 0n
        ? null
        : Number((actualValue * 10_000n + plannedValue / 2n) / plannedValue) / 100,
    status:
      plannedValue === null
        ? actualValue > 0n
          ? 'unplanned'
          : 'no_plan'
        : actualValue > plannedValue
          ? 'over_plan'
          : actualValue < plannedValue
            ? 'under_plan'
            : 'on_plan',
  };
}

function cells(august: PlanActual, transactions: number) {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    planActual: index === 7 ? august : plan(null, '0'),
    transactionCount: index === 7 ? transactions : 0,
  }));
}

const report: MonthlyReport = {
  year: 2026,
  branchFilter: 'all',
  averagePolicy: { code: 'months_with_actual', label: 'Fakt mavjud oylar', denominator: 1 },
  rows: [
    {
      category: { id: 'rent', code: 'RENT', name: 'Ijara', expenseTypeSnapshot: 'fixed' },
      months: cells(plan('70000000', '60000000'), 2),
      annual: { ...plan('70000000', '60000000'), transactionCount: 2 },
    },
    {
      category: {
        id: 'marketing',
        code: 'MARKETING',
        name: 'Marketing',
        expenseTypeSnapshot: 'variable',
      },
      months: cells(plan('10000000', '15000000'), 1),
      annual: { ...plan('10000000', '15000000'), transactionCount: 1 },
    },
  ],
  totals: {
    fixed: plan('70000000', '60000000'),
    variable: plan('10000000', '15000000'),
    overall: plan('80000000', '75000000'),
  },
};

const branch = (id: string, name: string, planned: string, actual: string) => ({
  branch: { id, code: id, name },
  expense: plan(planned, actual),
});
const totalBranch = {
  branch: { id: 'all', code: 'ALL', name: 'Markaz jami' },
  expense: plan('80000000', '75000000'),
};
const comparison: BranchComparisonReport = {
  year: 2026,
  selectedMonth: {
    month: 8,
    label: 'Avgust',
    rows: [],
    branches: [
      branch(SAYXUN, 'Sayxun', '40000000', '30000000'),
      branch(XALQLAR, 'Xalqlar do‘stligi', '40000000', '45000000'),
    ],
    total: totalBranch,
  },
  months: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    branches:
      index === 7
        ? [
            branch(SAYXUN, 'Sayxun', '40000000', '30000000'),
            branch(XALQLAR, 'Xalqlar do‘stligi', '40000000', '45000000'),
          ]
        : [],
    total: index === 7 ? totalBranch : { ...totalBranch, expense: plan(null, '0') },
  })),
  annual: { branches: [], total: totalBranch },
};

function renderPage(path = `/reports/monthly?period=${AUGUST}&branch=all`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <MonthlyReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Oylik xarajatlar boshqaruv dashboardi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: AUGUST,
        year: 2026,
        month: 8,
        label: 'Avgust 2026',
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
      {
        id: JULY,
        year: 2025,
        month: 7,
        label: 'Iyul 2025',
        status: 'closed',
        closedAt: null,
        closedByName: null,
      },
    ]);
    vi.mocked(reportApi.monthly).mockResolvedValue(report);
    vi.mocked(reportApi.branchComparison).mockResolvedValue(comparison);
  });

  it('Avgust + barcha filiallar uchun reja, fakt, farq, foiz va ikki filialni ko‘rsatadi', async () => {
    renderPage();
    const hero = await screen.findByRole('region', { name: 'Oylik moliyaviy natija' });
    expect(within(hero).getAllByTitle(/75.000.000/).length).toBeGreaterThan(0);
    expect(within(hero).getAllByTitle(/80.000.000/).length).toBeGreaterThan(0);
    expect(within(hero).getAllByTitle(/5.000.000/).length).toBeGreaterThan(0);
    expect(within(hero).getAllByText('Rejadan kam sarflangan').length).toBeGreaterThan(0);
    expect(within(hero).getAllByText('93,75%').length).toBeGreaterThan(0);
    const branches = screen.getByRole('region', { name: 'Filiallar bo‘yicha reja-fakt' });
    expect(within(branches).getByText('Sayxun')).toBeInTheDocument();
    expect(within(branches).getByText('Xalqlar do‘stligi')).toBeInTheDocument();
    expect(within(branches).getByText('Barcha filiallar jami')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Yillik reja va fakt trendi' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Kategoriyalar bo‘yicha batafsil hisobot' }),
    ).toBeInTheDocument();
    expect(reportApi.monthly).toHaveBeenCalledWith(
      { year: '2026', branch: 'all' },
      expect.any(AbortSignal),
    );
    expect(reportApi.branchComparison).toHaveBeenCalledWith(
      { year: '2026', month: 8, branch: 'all' },
      expect.any(AbortSignal),
    );
  });

  it('doimiy/o‘zgaruvchan, reja oshishi, tejash va top xarajatni ajratadi', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Xarajat tarkibi' });
    expect(screen.getByText('Doimiy xarajatlar')).toBeInTheDocument();
    expect(screen.getByText('O‘zgaruvchan xarajatlar')).toBeInTheDocument();
    const exceptions = screen.getByRole('region', { name: 'Rejadan og‘ishlar' });
    expect(within(exceptions).getByText('Marketing')).toBeInTheDocument();
    expect(within(exceptions).getByText('Ijara')).toBeInTheDocument();
    const top = screen.getByRole('region', { name: 'Eng katta xarajatlar' });
    expect(within(top).getByText('1. Ijara')).toBeInTheDocument();
  });

  it('bitta filial filterida faqat shu filialning requestlarini yuboradi', async () => {
    vi.mocked(reportApi.branchComparison).mockResolvedValue({
      ...comparison,
      selectedMonth: {
        ...comparison.selectedMonth,
        branches: [branch(SAYXUN, 'Sayxun', '80000000', '75000000')],
      },
    });
    renderPage(`/reports/monthly?period=${AUGUST}&branch=${SAYXUN}`);
    await screen.findByRole('region', { name: 'Oylik moliyaviy natija' });
    const branches = screen.getByRole('region', { name: 'Filiallar bo‘yicha reja-fakt' });
    expect(within(branches).getByText('Sayxun')).toBeInTheDocument();
    expect(within(branches).queryByText('Xalqlar do‘stligi')).not.toBeInTheDocument();
    expect(within(branches).queryByText('Barcha filiallar jami')).not.toBeInTheDocument();
    expect(reportApi.monthly).toHaveBeenCalledWith(
      { year: '2026', branch: SAYXUN },
      expect.any(AbortSignal),
    );
    expect(reportApi.branchComparison).toHaveBeenCalledWith(
      { year: '2026', month: 8, branch: SAYXUN },
      expect.any(AbortSignal),
    );
  });

  it('boshqa yil va oy tanlanganda ikkalasi ham bir xil filterga o‘tadi', async () => {
    vi.mocked(reportApi.monthly).mockResolvedValue({ ...report, year: 2025 });
    vi.mocked(reportApi.branchComparison).mockResolvedValue({
      ...comparison,
      year: 2025,
      selectedMonth: { ...comparison.selectedMonth, month: 7 },
    });
    renderPage(`/reports/monthly?period=${JULY}&branch=all`);
    await screen.findByText('Bu oy uchun ma’lumot mavjud emas');
    expect(reportApi.monthly).toHaveBeenCalledWith(
      { year: '2025', branch: 'all' },
      expect.any(AbortSignal),
    );
    expect(reportApi.branchComparison).toHaveBeenCalledWith(
      { year: '2025', month: 7, branch: 'all' },
      expect.any(AbortSignal),
    );
  });

  it('loading, bo‘sh va xato holatlarini moliyaviy qiymat bilan aralashtirmaydi', async () => {
    vi.mocked(reportApi.monthly).mockReturnValue(new Promise(() => {}));
    const view = renderPage();
    expect(
      await screen.findByRole('status', { name: 'Oylik hisobot yuklanmoqda' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Oylik moliyaviy natija' }),
    ).not.toBeInTheDocument();
    view.unmount();
    vi.mocked(reportApi.monthly).mockResolvedValue({ ...report, rows: [] });
    renderPage();
    expect(await screen.findByText('Bu oy uchun ma’lumot mavjud emas')).toBeInTheDocument();
  });

  it('API xatosida texnik tafsilotni oshkor qilmaydi', async () => {
    vi.mocked(reportApi.monthly).mockRejectedValue(new Error('private SQL details'));
    renderPage();
    expect(await screen.findByText('Hisobotni yuklab bo‘lmadi.')).toBeInTheDocument();
    expect(screen.queryByText('private SQL details')).not.toBeInTheDocument();
  });

  it('hisob davrlarini yuklash xatosida ham qayta urinishni ko‘rsatadi', async () => {
    vi.mocked(referenceApi.periods).mockRejectedValue(new Error('private period details'));
    renderPage();
    expect(await screen.findByText('Hisobotni yuklab bo‘lmadi.')).toBeInTheDocument();
    expect(screen.queryByText('private period details')).not.toBeInTheDocument();
  });

  it('filial va kategoriya jami mos kelmasa moliyaviy KPI ni ko‘rsatmaydi', async () => {
    vi.mocked(reportApi.branchComparison).mockResolvedValue({
      ...comparison,
      selectedMonth: {
        ...comparison.selectedMonth,
        total: { ...totalBranch, expense: plan('80000000', '74000000') },
      },
    });
    renderPage();
    expect(await screen.findByText('Hisobot manbalari mos kelmadi')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Oylik moliyaviy natija' }),
    ).not.toBeInTheDocument();
  });

  it('nol reja yozuvi haqiqiy 0 fakt bilan bo‘sh ma’lumot deb talqin qilinmaydi', async () => {
    const zero = { ...report, rows: [{ ...report.rows[0]!, months: cells(plan('0', '0'), 0) }] };
    vi.mocked(reportApi.monthly).mockResolvedValue(zero);
    vi.mocked(reportApi.branchComparison).mockResolvedValue({
      ...comparison,
      selectedMonth: {
        ...comparison.selectedMonth,
        total: { ...totalBranch, expense: plan('0', '0') },
      },
    });
    renderPage();
    const hero = await screen.findByRole('region', { name: 'Oylik moliyaviy natija' });
    expect(within(hero).getAllByTitle('0 so‘m').length).toBeGreaterThan(0);
    expect(within(hero).getAllByText('Reja mavjud emas').length).toBeGreaterThan(0);
  });

  it('rejasiz xarajat filial hisobotidagi 0 reja bilan moslashtiriladi', async () => {
    vi.mocked(reportApi.monthly).mockResolvedValue({
      ...report,
      rows: [{ ...report.rows[0]!, months: cells(plan(null, '1000'), 1) }],
    });
    vi.mocked(reportApi.branchComparison).mockResolvedValue({
      ...comparison,
      selectedMonth: {
        ...comparison.selectedMonth,
        total: { ...totalBranch, expense: plan('0', '1000') },
      },
    });
    renderPage();
    const hero = await screen.findByRole('region', { name: 'Oylik moliyaviy natija' });
    expect(within(hero).getAllByText('Rejasiz xarajat').length).toBeGreaterThan(0);
    expect(screen.queryByText('Hisobot manbalari mos kelmadi')).not.toBeInTheDocument();
  });

  it('nol reja va katta summalarni aniqlikni yo‘qotmasdan hisoblaydi', () => {
    const large = {
      ...report,
      rows: [
        { ...report.rows[0]!, months: cells(plan('900719925474099300', '900719925474099300'), 1) },
        { ...report.rows[1]!, months: cells(plan('0', '0'), 0) },
      ],
    };
    const summary = buildMonthlyExecutiveSummary(large, 8);
    expect(summary.overall.actualAmountUzs).toBe('900719925474099300');
    expect(summary.variable.completionPercent).toBeNull();
    expect(summary.overall.varianceUzs).toBe('0');
  });

  it('oylik tur, filial va umumiy jami Excel reja−fakt matematikasiga mos', () => {
    const summary = buildMonthlyExecutiveSummary(report, 8);
    const branchActual = comparison.selectedMonth.branches.reduce(
      (sum, item) => sum + BigInt(item.expense.actualAmountUzs),
      0n,
    );
    const branchPlan = comparison.selectedMonth.branches.reduce(
      (sum, item) => sum + BigInt(item.expense.plannedAmountUzs ?? '0'),
      0n,
    );
    expect(BigInt(summary.fixed.actualAmountUzs) + BigInt(summary.variable.actualAmountUzs)).toBe(
      BigInt(summary.overall.actualAmountUzs),
    );
    expect(
      BigInt(summary.fixed.plannedAmountUzs!) + BigInt(summary.variable.plannedAmountUzs!),
    ).toBe(BigInt(summary.overall.plannedAmountUzs!));
    expect(branchActual).toBe(BigInt(summary.overall.actualAmountUzs));
    expect(branchPlan).toBe(BigInt(summary.overall.plannedAmountUzs!));
    expect(summary.overall.varianceUzs).toBe((branchPlan - branchActual).toString());
    expect(summary.overall.completionPercent).toBe(93.75);
  });
});
