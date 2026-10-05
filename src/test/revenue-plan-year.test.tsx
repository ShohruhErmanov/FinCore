import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RevenuePlanYearOverview } from '@/features/revenue/revenue-plan-year';
import { revenueApi } from '@/shared/api/contracts';
import { formatMoney as formatMoneyUzs } from '@/shared/lib/format';
import type { RevenuePlanYear, RevenuePlanYearMonth } from '@/shared/types/domain';

const formatMoney = (value: string) => formatMoneyUzs(value).replace(/\u00a0/g, ' ');
const plain = (node: HTMLElement) => (node.textContent ?? '').replace(/\u00a0/g, ' ');

vi.mock('@/shared/api/contracts', () => ({ revenueApi: { planYear: vi.fn() } }));

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Container,
    BarChart: Container,
    Bar: Container,
    CartesianGrid: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
  };
});

const SAYXUN = '10000000-0000-4000-8000-000000000001';
const XALQLAR = '10000000-0000-4000-8000-000000000002';
const period = (month: number) =>
  `20000000-0000-4000-8000-0000000000${String(month).padStart(2, '0')}`;
const LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

/** The live 2026 figures: plans for August, September and December. */
const PLANS: Record<number, [string, string, string, string]> = {
  8: ['155252779', '152900153', '158875085', '143966386'],
  9: ['150000000', '160000000', '6000000', '5000000'],
  12: ['155252779', '152900153', '0', '0'],
};
const PCT: Record<number, [number, number, number]> = {
  8: [102.33, 94.16, 98.28],
  9: [4, 3.13, 3.55],
  12: [0, 0, 0],
};

function month(index: number): RevenuePlanYearMonth {
  const number = index + 1;
  const plan = PLANS[number];
  const pct = PCT[number];
  return {
    month: number,
    label: LABELS[index]!,
    periodId: period(number),
    plannedAmountUzs: plan ? (BigInt(plan[0]) + BigInt(plan[1])).toString() : null,
    actualAmountUzs: plan ? (BigInt(plan[2]) + BigInt(plan[3])).toString() : '0',
    actualAgainstPlanUzs: plan ? (BigInt(plan[2]) + BigInt(plan[3])).toString() : '0',
    completionPercent: pct ? pct[2] : null,
    branches: [
      {
        branchId: SAYXUN,
        plannedAmountUzs: plan ? plan[0] : null,
        actualAmountUzs: plan ? plan[2] : '0',
        completionPercent: pct ? pct[0] : null,
      },
      {
        branchId: XALQLAR,
        plannedAmountUzs: plan ? plan[1] : null,
        actualAmountUzs: plan ? plan[3] : '0',
        completionPercent: pct ? pct[1] : null,
      },
    ],
  };
}

const year: RevenuePlanYear = {
  year: 2026,
  plannedAmountUzs: '926305864',
  actualAmountUzs: '313841471',
  actualAgainstPlanUzs: '313841471',
  completionPercent: 33.88,
  plannedMonths: 3,
  branches: [
    {
      branchId: SAYXUN,
      branchName: 'Sayxun',
      plannedAmountUzs: '460505558',
      actualAmountUzs: '164875085',
      actualAgainstPlanUzs: '164875085',
      completionPercent: 35.8,
      plannedMonths: 3,
    },
    {
      branchId: XALQLAR,
      branchName: "Xalqlar do'stligi",
      plannedAmountUzs: '465800306',
      actualAmountUzs: '148966386',
      actualAgainstPlanUzs: '148966386',
      completionPercent: 31.98,
      plannedMonths: 3,
    },
  ],
  months: Array.from({ length: 12 }, (_, index) => month(index)),
};

function renderOverview(branchId = 'all', onSelectPeriod = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RevenuePlanYearOverview
        year={2026}
        branchId={branchId}
        selectedPeriodId={period(8)}
        onSelectPeriod={onSelectPeriod}
      />
    </QueryClientProvider>,
  );
  return onSelectPeriod;
}

const table = () => screen.getByRole('table', { name: '2026-yil oylar bo‘yicha tushum rejasi' });
const rowOf = (label: string) =>
  within(table()).getByRole('row', { name: new RegExp(`^${label}\\b`) });

describe('Yillik tushum rejasi', () => {
  beforeEach(() => {
    vi.mocked(revenueApi.planYear).mockReset().mockResolvedValue(year);
  });

  it('asks the server for the selected year', async () => {
    renderOverview();
    await screen.findByRole('heading', { name: '2026-yil tushum rejasi · barcha oylar' });
    expect(revenueApi.planYear).toHaveBeenCalledWith(2026, expect.anything());
  });

  it('lists all twelve months with every branch plan side by side', async () => {
    renderOverview();
    await screen.findByRole('table');

    // Twelve months plus the header and the total row.
    expect(within(table()).getAllByRole('row')).toHaveLength(14);
    expect(within(table()).getByRole('columnheader', { name: 'Sayxun' })).toBeInTheDocument();
    expect(
      within(table()).getByRole('columnheader', { name: "Xalqlar do'stligi" }),
    ).toBeInTheDocument();

    const august = plain(rowOf('Avg'));
    expect(august).toContain(formatMoney('155252779'));
    expect(august).toContain(formatMoney('152900153'));
    expect(august).toContain(formatMoney('308152932'));
    expect(august).toContain('98,28%');
  });

  it('shows a dash, not a zero plan, for a month nobody planned', async () => {
    renderOverview();
    await screen.findByRole('table');
    const march = rowOf('Mar');
    expect(within(march).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(plain(march)).not.toContain('Reja mavjud emas');
  });

  it('totals the year in the footer and in the summary cards', async () => {
    renderOverview();
    await screen.findByRole('table');

    const footer = plain(rowOf('Jami'));
    expect(footer).toContain(formatMoney('460505558'));
    expect(footer).toContain(formatMoney('465800306'));
    expect(footer).toContain(formatMoney('926305864'));
    expect(footer).toContain('33,88%');

    const cards = within(screen.getByRole('region', { name: 'Yillik reja ko‘rsatkichlari' }));
    expect(cards.getByText('3 / 12')).toBeInTheDocument();
    expect(cards.getByText('9 oyda reja yo‘q')).toBeInTheDocument();
    expect(
      cards.getAllByText(
        (_, node) => plain(node as HTMLElement) === `Rejagacha yana ${formatMoney('612464393')}`,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('narrows to one branch when the app bar does', async () => {
    renderOverview(XALQLAR);
    await screen.findByRole('table');

    expect(
      screen.getByText("Xalqlar do'stligi: har oy kiritilgan reja va amaldagi tushum"),
    ).toBeInTheDocument();
    expect(within(table()).queryByRole('columnheader', { name: 'Sayxun' })).not.toBeInTheDocument();
    expect(within(table()).getByRole('columnheader', { name: 'Reja' })).toBeInTheDocument();

    const august = plain(rowOf('Avg'));
    expect(august).toContain(formatMoney('152900153'));
    expect(august).not.toContain(formatMoney('155252779'));
    expect(august).toContain('94,16%');
    expect(plain(rowOf('Jami'))).toContain(formatMoney('465800306'));
  });

  it('opens a month in the board above when its name is clicked', async () => {
    const onSelectPeriod = renderOverview();
    await screen.findByRole('table');

    await userEvent.click(within(rowOf('Sen')).getByRole('button', { name: 'Sen' }));
    expect(onSelectPeriod).toHaveBeenCalledWith(period(9));
  });

  it('marks the month already open in the board and offers no link to it', async () => {
    renderOverview();
    await screen.findByRole('table');

    const august = rowOf('Avg');
    expect(august).toHaveAttribute('aria-current', 'true');
    expect(within(august).queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a retry when the year cannot be loaded', async () => {
    vi.mocked(revenueApi.planYear).mockRejectedValue(new Error('network'));
    renderOverview();
    expect(await screen.findByRole('button', { name: /qayta/i })).toBeInTheDocument();
  });
});
