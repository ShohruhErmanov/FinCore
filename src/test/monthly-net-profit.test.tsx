import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MonthlyNetProfit } from '@/features/dashboard/monthly-net-profit';
import { formatMoney } from '@/shared/lib/format';
import type { AnnualNetProfit, NetProfitMonth } from '@/shared/types/domain';

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Container,
    LineChart: Container,
    Line: Container,
    CartesianGrid: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
  };
});

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

/** Non-breaking spaces make exact text matching brittle. */
const plain = (value: string) => value.replace(/\u00a0/g, ' ');

function month(overrides: Partial<NetProfitMonth> & { month: number }): NetProfitMonth {
  return {
    label: LABELS[overrides.month - 1]!,
    revenueUzs: '0',
    expenseUzs: '0',
    netProfitUzs: '0',
    changePct: null,
    comparedToLabel: null,
    hasData: false,
    ...overrides,
  };
}

function data(overrides: Partial<AnnualNetProfit> = {}): AnnualNetProfit {
  const months = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    if (number === 7)
      return month({
        month: 7,
        revenueUzs: '20000000',
        expenseUzs: '25000000',
        netProfitUzs: '-5000000',
        hasData: true,
      });
    if (number === 8)
      return month({
        month: 8,
        revenueUzs: '50000000',
        expenseUzs: '26000000',
        netProfitUzs: '24000000',
        changePct: 580,
        comparedToLabel: 'Iyul',
        hasData: true,
      });
    return month({ month: number });
  });

  return {
    year: 2026,
    totalNetProfitUzs: '19000000',
    netMarginPct: 27.14,
    bestMonth: { month: 8, label: 'Avg', netProfitUzs: '24000000' },
    worstMonth: { month: 7, label: 'Iyul', netProfitUzs: '-5000000' },
    monthsWithData: 2,
    months,
    paymentMethods: [],
    paymentMethodMonths: months.map((row) => ({
      month: row.month,
      label: row.label,
      totalNetProfitUzs: row.netProfitUzs,
      paymentMethods: [],
    })),
    ...overrides,
  };
}

const section = () => screen.getByRole('region', { name: 'Oylik sof foyda' });
/** The twelve month tiles, apart from the summary chips below them. */
const tiles = () => within(screen.getByRole('list', { name: 'Oylar' }));

describe('Oylik sof foyda', () => {
  it('names the year in the heading and the subtitle', () => {
    render(<MonthlyNetProfit data={data()} />);
    expect(screen.getByRole('heading', { name: '2026-yil oylik sof foyda' })).toBeInTheDocument();
    expect(screen.getByText('Har bir oy bo‘yicha sof foyda ko‘rsatkichi')).toBeInTheDocument();
  });

  it('shows all twelve months, not only the ones with data', () => {
    render(<MonthlyNetProfit data={data()} />);
    // A gap in the year is information; hiding it would imply those months
    // broke even.
    expect(tiles().getAllByRole('listitem')).toHaveLength(12);
    for (const label of LABELS) {
      expect(tiles().getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('marks a month with no revenue and no expense as having none', () => {
    render(<MonthlyNetProfit data={data()} />);
    expect(tiles().getAllByText('Ma’lumot yo‘q')).toHaveLength(10);
  });

  it('shows a profit and a loss as two different figures', () => {
    render(<MonthlyNetProfit data={data()} />);
    expect(tiles().getByText(plain(formatMoney('24000000')))).toBeInTheDocument();
    expect(tiles().getByText(plain(formatMoney('-5000000')))).toBeInTheDocument();
  });

  it('spells the amount out in full, not rounded to millions', () => {
    render(<MonthlyNetProfit data={data()} />);
    // The tile carries the real figure: 24 000 000 so‘m, not "24 mln".
    const tile = tiles().getByText(plain(formatMoney('24000000')));
    expect(plain(tile.textContent ?? '')).toBe('24 000 000 so‘m');
    expect(plain(tile.getAttribute('title') ?? '')).toBe('24 000 000 so‘m');
  });

  it('shows the month-on-month change where there is one', () => {
    render(<MonthlyNetProfit data={data()} />);
    expect(tiles().getByText('580%')).toBeInTheDocument();
    // Which month it is measured against, so the figure can be read at all.
    expect(tiles().getByText('· Iyul')).toBeInTheDocument();
  });

  it('caps an unreadable change but keeps the real one in the title', () => {
    // A sparse year genuinely produces figures like 4 929 124,5%.
    const sparse = data();
    sparse.months[7] = {
      ...sparse.months[7]!,
      changePct: 4929124.52,
      comparedToLabel: 'Yan',
    };
    render(<MonthlyNetProfit data={sparse} />);

    const badge = tiles().getByText('>999%');
    expect(badge).toBeInTheDocument();
    expect(plain(badge.closest('p')?.getAttribute('title') ?? '')).toBe(
      'Yan oyiga nisbatan 4 929 124,5%',
    );
  });

  it('totals the year, and says how many months it is based on', () => {
    render(<MonthlyNetProfit data={data()} />);
    expect(screen.getByText('Yillik jami sof foyda')).toBeInTheDocument();
    expect(
      screen
        .getAllByText(/19 000 000/)
        .some((node) => plain(node.textContent ?? '').includes('19 000 000 so‘m')),
    ).toBe(true);
    expect(screen.getByText('Ma’lumot mavjud 2 oy bo‘yicha')).toBeInTheDocument();
  });

  it('names the best and the worst month', () => {
    render(<MonthlyNetProfit data={data()} />);
    expect(screen.getByText('Eng yuqori foyda')).toBeInTheDocument();
    expect(screen.getByText('Avg oyi')).toBeInTheDocument();
    expect(screen.getByText('Eng past foyda')).toBeInTheDocument();
    expect(screen.getByText('Iyul oyi')).toBeInTheDocument();
  });

  it('says nothing is recorded rather than showing a false zero month', () => {
    render(
      <MonthlyNetProfit
        data={data({
          totalNetProfitUzs: '0',
          bestMonth: null,
          worstMonth: null,
          monthsWithData: 0,
          months: Array.from({ length: 12 }, (_, index) => month({ month: index + 1 })),
        })}
      />,
    );

    expect(screen.getByText('Ma’lumot kiritilgan oy yo‘q')).toBeInTheDocument();
    // An empty year has no best or worst month — a dash, not January at zero.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the year as a plain chip when there is only one to pick', () => {
    render(<MonthlyNetProfit data={data()} years={[2026]} onYearChange={vi.fn()} />);
    expect(screen.queryByLabelText('Yil')).not.toBeInTheDocument();
    expect(within(section()).getByText('2026')).toBeInTheDocument();
  });

  it('offers a year selector when more than one year exists', async () => {
    const onYearChange = vi.fn();
    render(<MonthlyNetProfit data={data()} years={[2026, 2025]} onYearChange={onYearChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Yil'), '2025');
    expect(onYearChange).toHaveBeenCalledWith(2025);
  });

  it('offers no selector at all when the caller passes no years', () => {
    render(<MonthlyNetProfit data={data()} />);
    expect(screen.queryByLabelText('Yil')).not.toBeInTheDocument();
  });

  it('shows payment-method amounts, percentages and all twelve monthly rows', () => {
    const cash = {
      paymentMethodId: '40000000-0000-4000-8000-000000000001',
      code: 'CASH',
      name: 'Naqd pul',
      revenueUzs: '30000000',
      expenseUzs: '10000000',
      netProfitUzs: '20000000',
      sharePct: 80,
    };
    const card = {
      paymentMethodId: '40000000-0000-4000-8000-000000000002',
      code: 'CARD',
      name: 'Plastik karta',
      revenueUzs: '10000000',
      expenseUzs: '5000000',
      netProfitUzs: '5000000',
      sharePct: 20,
    };
    const clickPayme = {
      paymentMethodId: '40000000-0000-4000-8000-000000000004',
      code: 'CLICK_PAYME',
      name: 'Click/Payme',
      revenueUzs: '0',
      expenseUzs: '0',
      netProfitUzs: '0',
      sharePct: 0,
    };
    const paymentMethodMonths = LABELS.map((label, index) => ({
      month: index + 1,
      label,
      totalNetProfitUzs: index === 7 ? '25000000' : '0',
      paymentMethods: [cash, card, clickPayme].map((method) => ({
        paymentMethodId: method.paymentMethodId,
        code: method.code,
        name: method.name,
        netProfitUzs: index === 7 ? method.netProfitUzs : '0',
      })),
    }));

    render(
      <MonthlyNetProfit
        data={data({
          totalNetProfitUzs: '25000000',
          paymentMethods: [cash, card, clickPayme],
          paymentMethodMonths,
        })}
      />,
    );

    expect(screen.getAllByText('Naqd pul').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Plastik karta').length).toBeGreaterThan(0);
    expect(screen.queryByText('Click/Payme')).not.toBeInTheDocument();
    expect(screen.getByText('Jami natijaning 80%')).toBeInTheDocument();
    expect(screen.getByText('Jami natijaning 20%')).toBeInTheDocument();
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(12);
  });
});
