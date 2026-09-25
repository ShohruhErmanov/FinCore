import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AnnualFinancialOverview,
  AnnualNetProfitTiles,
  AnnualRevenueTiles,
} from '@/features/dashboard/annual-financials';
import type {
  AnnualExpenseSummary,
  AnnualNetProfit,
  AnnualRevenue,
  RevenueGrowth,
} from '@/shared/types/domain';

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Container,
    BarChart: Container,
    Bar: Container,
    Line: Container,
    CartesianGrid: Container,
    Legend: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
  };
});

/** Non-breaking spaces make exact text matching brittle. */
const plain = (value: string) => value.replace(/\u00a0/g, ' ');
const LABELS = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyun',
  'Iyul',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

function revenue(overrides: Partial<AnnualRevenue> = {}): AnnualRevenue {
  return {
    year: 2026,
    totalActualUzs: '295741471',
    totalPlanUzs: '300000000',
    completionPct: 98.58,
    averageMonthlyUzs: '24645122',
    averageMonthsCount: 12,
    peakMonth: { month: 8, label: 'Avg', actualUzs: '38450000' },
    growthPct: 18.7,
    previousYear: 2025,
    previousYearUzs: '249150000',
    months: LABELS.map((label, index) => ({
      month: index + 1,
      label,
      actualUzs: index === 7 ? '38450000' : '0',
      planUzs: '0',
      completionPct: null,
    })),
    ...overrides,
  };
}

function netProfit(overrides: Partial<AnnualNetProfit> = {}): AnnualNetProfit {
  return {
    year: 2026,
    totalNetProfitUzs: '288635471',
    netMarginPct: 97.6,
    bestMonth: { month: 8, label: 'Avg', netProfitUzs: '37740000' },
    worstMonth: { month: 1, label: 'Yan', netProfitUzs: '-6000' },
    monthsWithData: 3,
    months: LABELS.map((label, index) => ({
      month: index + 1,
      label,
      revenueUzs: index === 7 ? '38450000' : '0',
      expenseUzs: index === 7 ? '710000' : '0',
      netProfitUzs: index === 7 ? '37740000' : '0',
      changePct: null,
      comparedToLabel: null,
      hasData: index === 7,
    })),
    paymentMethods: [],
    paymentMethodMonths: LABELS.map((label, index) => ({
      month: index + 1,
      label,
      totalNetProfitUzs: index === 7 ? '37740000' : '0',
      paymentMethods: [],
    })),
    ...overrides,
  };
}

const expense = { totalActualUzs: '7106000' } as AnnualExpenseSummary;

function growth(overrides: Partial<RevenueGrowth> = {}): RevenueGrowth {
  return {
    monthly: {
      month: 9,
      monthLabel: 'Sen',
      previousMonth: 8,
      previousMonthLabel: 'Avg',
      currentUzs: '112000000',
      previousUzs: '100000000',
      changePct: 12,
      throughDay: null,
    },
    annual: {
      year: 2026,
      previousYear: 2025,
      currentUzs: '295741471',
      previousUzs: '249150000',
      changePct: 18.7,
    },
    ...overrides,
  };
}

describe('Yillik tushum kartalari', () => {
  it('shows the total against its plan and completion', () => {
    render(<AnnualRevenueTiles data={revenue()} growth={growth()} />);
    expect(screen.getByText(plain('295 741 471 so‘m'))).toBeInTheDocument();
    expect(plain(screen.getByText(/Reja/).textContent ?? '')).toContain('300 000 000 so‘m');
    expect(plain(screen.getByText(/Reja/).textContent ?? '')).toContain('98,58%');
  });

  it('averages only over months that earned', () => {
    render(<AnnualRevenueTiles data={revenue({ averageMonthsCount: 3 })} growth={growth()} />);
    expect(screen.getByText('Tushum bo‘lgan 3 oy bo‘yicha')).toBeInTheDocument();
  });

  it('names the biggest month', () => {
    render(<AnnualRevenueTiles data={revenue()} growth={growth()} />);
    expect(screen.getByText('Eng yuqori oylik tushum')).toBeInTheDocument();
    expect(screen.getByText('Avg 2026')).toBeInTheDocument();
  });

  it('keeps monthly and annual growth as two separate cards', () => {
    render(<AnnualRevenueTiles data={revenue()} growth={growth()} />);

    // Two questions, two numbers — never one figure that changes meaning.
    expect(screen.getByText('Tushum o‘sishi (oylik)')).toBeInTheDocument();
    expect(screen.getByText('Tushum o‘sishi (yillik)')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('18,7%')).toBeInTheDocument();
  });

  it('names the two complete calendar months being compared', () => {
    render(<AnnualRevenueTiles data={revenue()} growth={growth()} />);
    expect(plain(screen.getByText(/Sen vs Avg/).textContent ?? '')).toContain('100 000 000 so‘m');
  });

  it('drops the day range once the month is complete', () => {
    render(
      <AnnualRevenueTiles
        data={revenue()}
        growth={growth({
          monthly: {
            ...growth().monthly,
            month: 8,
            monthLabel: 'Avg',
            previousMonthLabel: 'Iyul',
            throughDay: null,
          },
        })}
      />,
    );
    expect(screen.getByText(/Avg vs Iyul/)).toBeInTheDocument();
    expect(screen.queryByText(/1–/)).not.toBeInTheDocument();
  });

  it('shows the real zero-to-current movement without inventing a percentage', () => {
    render(
      <AnnualRevenueTiles
        data={revenue()}
        growth={growth({ monthly: { ...growth().monthly, changePct: null, previousUzs: '0' } })}
      />,
    );
    expect(screen.getByText(plain('0 → 112 000 000 so‘m'))).toBeInTheDocument();
    expect(screen.getByText(/Sen vs Avg · oldingi davr 0 so‘m/)).toBeInTheDocument();
    expect(screen.getByText(/foiz hisoblanmaydi/)).toBeInTheDocument();
  });

  it('shows the annual zero-to-current movement when last year is empty', () => {
    render(
      <AnnualRevenueTiles
        data={revenue()}
        growth={growth({ annual: { ...growth().annual, changePct: null, previousUzs: '0' } })}
      />,
    );
    expect(screen.getByText(plain('0 → 295 741 471 so‘m'))).toBeInTheDocument();
    expect(screen.getByText(/2026 vs 2025 · oldingi davr 0 so‘m/)).toBeInTheDocument();
  });

  it('keeps the unavailable state when both compared periods are empty', () => {
    render(
      <AnnualRevenueTiles
        data={revenue()}
        growth={growth({
          monthly: {
            ...growth().monthly,
            currentUzs: '0',
            previousUzs: '0',
            changePct: null,
          },
        })}
      />,
    );
    expect(screen.getByText(/Sen vs Avg — ma’lumot mavjud emas/)).toBeInTheDocument();
  });

  it('shows a dash rather than a zero when nothing was earned', () => {
    render(
      <AnnualRevenueTiles
        data={revenue({ peakMonth: null, averageMonthsCount: 0, averageMonthlyUzs: '0' })}
        growth={growth()}
      />,
    );
    expect(screen.getByText('Tushum kiritilgan oy yo‘q')).toBeInTheDocument();
    expect(screen.getByText('Ma’lumot yo‘q')).toBeInTheDocument();
  });
});

describe('Yillik sof foyda kartalari', () => {
  it('shows the profit and the margin', () => {
    render(<AnnualNetProfitTiles data={netProfit()} />);
    expect(screen.getByText(plain('288 635 471 so‘m'))).toBeInTheDocument();
    expect(screen.getByText('97,6%')).toBeInTheDocument();
    expect(screen.getByText('Tushumning sof foyda sifatida qolgan ulushi')).toBeInTheDocument();
  });

  it('leaves the margin out when there was no revenue to divide by', () => {
    render(<AnnualNetProfitTiles data={netProfit({ netMarginPct: null })} />);
    expect(screen.getByText('Tushum bo‘lmagani uchun hisoblanmadi')).toBeInTheDocument();
  });

  it('names the best and worst month', () => {
    render(<AnnualNetProfitTiles data={netProfit()} />);
    expect(screen.getByText('Eng yuqori foyda oyi')).toBeInTheDocument();
    expect(screen.getByText('Eng past foyda oyi')).toBeInTheDocument();
    expect(screen.getByText(plain('−6 000 so‘m'))).toBeInTheDocument();
  });
});

describe('Yillik moliyaviy ko‘rsatkichlar', () => {
  it('shows the chain: revenue, expense, profit', () => {
    render(
      <AnnualFinancialOverview revenue={revenue()} expense={expense} netProfit={netProfit()} />,
    );

    expect(screen.getByText('Yillik moliyaviy ko‘rsatkichlar')).toBeInTheDocument();
    expect(screen.getAllByText(plain('295 741 471 so‘m')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(plain('7 106 000 so‘m')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(plain('288 635 471 so‘m')).length).toBeGreaterThan(0);
  });

  it('scales every bar against the largest figure, not each against itself', () => {
    render(
      <AnnualFinancialOverview revenue={revenue()} expense={expense} netProfit={netProfit()} />,
    );

    // Revenue is the biggest, so it fills the track; expense is a sliver of it.
    const revenueBar = screen.getByRole('img', { name: /^Tushum:/ }).firstElementChild;
    const expenseBar = screen.getByRole('img', { name: /^Xarajat:/ }).firstElementChild;
    expect((revenueBar as HTMLElement).style.width).toBe('100%');
    expect(Number.parseFloat((expenseBar as HTMLElement).style.width)).toBeLessThan(5);
  });

  it('keeps a loss inside the track rather than overflowing it', () => {
    const loss = netProfit({ totalNetProfitUzs: '-400000000', netMarginPct: -135.2 });
    render(<AnnualFinancialOverview revenue={revenue()} expense={expense} netProfit={loss} />);

    const profitBar = screen.getByRole('img', { name: /^Sof foyda:/ }).firstElementChild;
    // The loss is larger than revenue, so it becomes the scale — 100%, not 135%.
    expect((profitBar as HTMLElement).style.width).toBe('100%');
  });

  it('draws nothing rather than dividing by zero on an empty year', () => {
    const empty = netProfit({ totalNetProfitUzs: '0' });
    render(
      <AnnualFinancialOverview
        revenue={revenue({ totalActualUzs: '0' })}
        expense={{ totalActualUzs: '0' } as AnnualExpenseSummary}
        netProfit={empty}
      />,
    );

    for (const name of [/^Tushum:/, /^Xarajat:/, /^Sof foyda:/]) {
      const bar = screen.getByRole('img', { name }).firstElementChild;
      expect((bar as HTMLElement).style.width).toBe('0%');
    }
  });
});
