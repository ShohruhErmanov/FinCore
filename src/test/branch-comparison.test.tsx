import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchComparisonPage } from '@/features/reports/FinancialReportPages';
import { reportApi, referenceApi } from '@/shared/api/contracts';
import { routes } from '@/shared/config/routes';
import type { BranchComparisonReport, PlanActual } from '@/shared/types/domain';

vi.mock('@/shared/api/contracts', () => ({
  reportApi: { branchComparison: vi.fn() },
  referenceApi: { branches: vi.fn(), periods: vi.fn() },
}));

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Container,
    BarChart: Container,
    CartesianGrid: Container,
    Legend: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
    Bar: Container,
  };
});

const SAYXUN = '00000000-0000-4000-8000-000000000020';
const XALQLAR = '00000000-0000-4000-8000-000000000021';
const AUGUST_PERIOD = '00000000-0000-4000-8000-000000002026';

function planActual(plan: string, actual: string): PlanActual {
  const planned = BigInt(plan);
  const fact = BigInt(actual);
  const scaledPercent = (fact * 10_000n + planned / 2n) / planned;
  return {
    hasPlan: true,
    plannedAmountUzs: plan,
    actualAmountUzs: actual,
    varianceUzs: (planned - fact).toString(),
    completionPercent: Number(scaledPercent) / 100,
    status: fact > planned ? 'over_plan' : fact === planned ? 'on_plan' : 'under_plan',
  };
}

const branches = [
  { id: SAYXUN, code: 'SAYXUN', name: 'Sayxun', isActive: true },
  { id: XALQLAR, code: 'XALQLAR', name: 'Xalqlar do‘stligi', isActive: true },
];

const report: BranchComparisonReport = {
  year: 2026,
  selectedMonth: {
    month: 8,
    label: 'Avgust',
    rows: [
      {
        category: {
          id: '60000000-0000-4000-8000-000000000001',
          code: 'RENT',
          name: 'Ijara (bino arendasi)',
          snapshotName: 'Ijara (bino arendasi)',
          expenseTypeSnapshot: 'fixed',
        },
        branches: [
          {
            branch: { ...branches[0]!, snapshotName: 'Sayxun' },
            expense: planActual('7000000', '20000000'),
          },
          {
            branch: { ...branches[1]!, snapshotName: 'Xalqlar do‘stligi' },
            expense: planActual('20000000', '15000000'),
          },
        ],
        total: {
          branch: { id: 'all', code: 'ALL', name: 'Markaz jami', snapshotName: 'Markaz jami' },
          expense: planActual('27000000', '35000000'),
        },
      },
      {
        category: {
          id: '60000000-0000-4000-8000-000000000002',
          code: 'MARKETING',
          name: 'Marketing va reklama',
          snapshotName: 'Marketing va reklama',
          expenseTypeSnapshot: 'variable',
        },
        branches: [
          {
            branch: { ...branches[0]!, snapshotName: 'Sayxun' },
            expense: planActual('7400000', '17986500'),
          },
          {
            branch: { ...branches[1]!, snapshotName: 'Xalqlar do‘stligi' },
            expense: planActual('20000000', '7371400'),
          },
        ],
        total: {
          branch: { id: 'all', code: 'ALL', name: 'Markaz jami', snapshotName: 'Markaz jami' },
          expense: planActual('27400000', '25357900'),
        },
      },
    ],
    branches: [
      {
        branch: { ...branches[0]!, snapshotName: 'Sayxun' },
        expense: planActual('14400000', '37986500'),
      },
      {
        branch: { ...branches[1]!, snapshotName: 'Xalqlar do‘stligi' },
        expense: planActual('40000000', '22371400'),
      },
    ],
    total: {
      branch: { id: 'all', code: 'ALL', name: 'Markaz jami', snapshotName: 'Markaz jami' },
      expense: planActual('54400000', '60357900'),
    },
  },
  months: Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const sayxun = planActual(month === 8 ? '1000' : '100', month === 8 ? '400' : '0');
    const xalqlar = planActual(month === 8 ? '800' : '80', month === 8 ? '200' : '0');
    return {
      month,
      branches: [
        { branch: { ...branches[0]!, snapshotName: 'Sayxun' }, expense: sayxun },
        { branch: { ...branches[1]!, snapshotName: 'Xalqlar do‘stligi' }, expense: xalqlar },
      ],
      total: {
        branch: { id: 'all', code: 'ALL', name: 'Markaz jami', snapshotName: 'Markaz jami' },
        expense: planActual(
          (BigInt(sayxun.plannedAmountUzs!) + BigInt(xalqlar.plannedAmountUzs!)).toString(),
          (BigInt(sayxun.actualAmountUzs) + BigInt(xalqlar.actualAmountUzs)).toString(),
        ),
      },
    };
  }),
  annual: {
    branches: [
      {
        branch: { ...branches[0]!, snapshotName: 'Sayxun' },
        expense: planActual('14400000', '37986500'),
      },
      {
        branch: { ...branches[1]!, snapshotName: 'Xalqlar do‘stligi' },
        expense: planActual('40000000', '22371400'),
      },
    ],
    total: {
      branch: { id: 'all', code: 'ALL', name: 'Markaz jami', snapshotName: 'Markaz jami' },
      expense: planActual('54400000', '60357900'),
    },
  },
};

const singleBranchReport: BranchComparisonReport = {
  ...report,
  selectedMonth: {
    ...report.selectedMonth,
    rows: report.selectedMonth.rows.map((row) => ({
      ...row,
      branches: row.branches.slice(0, 1),
      total: row.branches[0]!,
    })),
    branches: report.selectedMonth.branches.slice(0, 1),
    total: report.selectedMonth.branches[0]!,
  },
  months: report.months.map((item) => ({
    ...item,
    branches: item.branches.slice(0, 1),
    total: item.branches[0]!,
  })),
  annual: {
    branches: report.annual.branches.slice(0, 1),
    total: report.annual.branches[0]!,
  },
};

function renderPage(branch = 'all') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[`${routes.branchReport}?period=${AUGUST_PERIOD}&branch=${branch}`]}
      >
        <BranchComparisonPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Filiallar taqqoslash — Excel bilan mos ko‘rinish', () => {
  beforeEach(() => {
    vi.mocked(referenceApi.branches).mockResolvedValue(branches);
    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: AUGUST_PERIOD,
        year: 2026,
        month: 8,
        label: '2026-08',
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
    ]);
    vi.mocked(reportApi.branchComparison).mockResolvedValue(report);
  });

  it('oylik jadvalda har bir filial fakt va rejasini, jami hamda mavjud qo‘shimcha ustunlarni saqlaydi', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: /oylik taqqoslash/i });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);

    expect(headers).toEqual([
      'Oy',
      'Sayxun fakt',
      'Xalqlar do‘stligi fakt',
      'Jami fakt',
      'Sayxun reja',
      'Xalqlar do‘stligi reja',
      'Jami reja',
      'Farq',
      'Bajarilish',
    ]);
    expect(within(table).getByRole('row', { name: /Avgust/ })).toBeInTheDocument();
  });

  it('Excel 2_filial_bitta_jadval kesimida kategoriya va uchta reja-fakt-farq blokini ko‘rsatadi', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: /Avgust ikki filial bitta jadval/i });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual(
      expect.arrayContaining([
        'Turi',
        'Xarajat kategoriyasi',
        'Sayxun filiali',
        'Xalqlar do‘stligi filiali',
        'Ikki filial jami',
      ]),
    );
    expect(within(table).getByRole('row', { name: /Ijara \(bino arendasi\)/ })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Marketing va reklama/ })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Umumiy jami/i })).toBeInTheDocument();

    const result = screen.getByRole('table', { name: 'Filial natijasi' });
    expect(within(result).getByRole('columnheader', { name: 'Ishlatildi %' })).toBeInTheDocument();
    expect(vi.mocked(reportApi.branchComparison)).toHaveBeenCalledWith(
      { year: '2026', month: '8', branch: 'all' },
      expect.any(AbortSignal),
    );
    expect(screen.queryByText('Hisobot filtrlari')).not.toBeInTheDocument();
  });

  it('navbar period va filial parametrlarini API so‘roviga uzatadi', async () => {
    vi.mocked(reportApi.branchComparison).mockResolvedValue(singleBranchReport);
    renderPage(SAYXUN);

    await screen.findByText('Oylik xarajatlar — Sayxun');
    expect(vi.mocked(reportApi.branchComparison)).toHaveBeenCalledWith(
      { year: '2026', month: '8', branch: SAYXUN },
      expect.any(AbortSignal),
    );
    expect(screen.queryByText('Ikki filial jami')).not.toBeInTheDocument();
    expect(screen.queryByText('Filial ma’lumoti mavjud emas')).not.toBeInTheDocument();
  });

  it('Excel shaklidagi yillik fakt, reja va bajarilish jadvalini chiqaradi', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: /yillik fakt, reja/i });
    expect(within(table).getByRole('columnheader', { name: 'Filial' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Yillik fakt' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Yillik reja' })).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Reja bajarilishi' }),
    ).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Sayxun/ })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Xalqlar do‘stligi/ })).toBeInTheDocument();
  });

  it('mavjud kartalar, diagrammalar va CSV eksportini saqlaydi', async () => {
    renderPage();

    await screen.findByRole('table', { name: /oylik taqqoslash/i });
    expect(screen.getByRole('button', { name: /CSV yuklab olish/i })).toBeEnabled();
    expect(
      screen.getByLabelText(/Sayxun va Xalqlar do‘stligi oylar bo‘yicha xarajat/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/yillik xarajat reja va fakt/i)).toBeInTheDocument();
    expect(screen.getAllByText('Markaz jami').length).toBeGreaterThan(0);
  });

  it('reja bajarilishi foizlarini to‘liq ikki kasr bilan chiqaradi', async () => {
    renderPage();

    expect((await screen.findAllByText('263,80%')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('55,93%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('110,95%').length).toBeGreaterThan(0);
  });
});
