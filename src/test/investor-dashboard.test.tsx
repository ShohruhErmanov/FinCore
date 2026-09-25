import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvestorDetailPage, InvestorListPage } from '@/features/investors/InvestorPages';
import { investorApi, payoutApi } from '@/shared/api/contracts';
import type { PayoutRequestRow, PayoutSummary } from '@/shared/types/domain';

vi.mock('@/shared/api/contracts', () => ({
  payoutApi: { list: vi.fn(), summary: vi.fn(), mine: vi.fn() },
  investorApi: { dashboard: vi.fn() },
  referenceApi: { periods: vi.fn() },
}));

// The app bar's period; stubbing the hook keeps these tests about the page.
const selectedPeriod = vi.hoisted(() => ({
  current: { year: 2026, month: 8 as number | null, periodId: 'period-8' as string | null },
}));
vi.mock('@/features/investors/use-selected-period', () => ({
  useSelectedPeriod: () => selectedPeriod.current,
}));

const INVESTOR_ID = '44444444-0000-4000-8000-000000000001';

/** Non-breaking spaces make exact text matching brittle. */
const plain = (value: string) => value.replace(/\u00a0/g, ' ');
const findText = (expected: string) =>
  screen.findAllByText((_, node) => plain(node?.textContent ?? '') === expected);

/** The <section> a Card renders, found by its heading. */
const card = (title: RegExp | string) =>
  screen.getByRole('heading', { name: title }).closest('section')!;

const INVESTOR = {
  id: INVESTOR_ID,
  userId: 'user-1',
  fullName: 'Ali Valiyev',
  phone: '+998901112233',
  ownershipPercent: 2,
  branch: null,
  isActive: true,
  capitalContribution: {
    amountUzs: '100000000',
    startPeriod: { id: 'period-8', year: 2026, month: 8, label: 'Avgust' },
    paymentMethod: { id: 'bank', code: 'BANK_TRANSFER' as const, name: 'Bank o‘tkazmasi' },
  },
};

/** August carries the worked example; every other month is empty. */
function summary(overrides: Partial<PayoutSummary> = {}): PayoutSummary {
  const months = Array.from({ length: 12 }, (_, index) => {
    const august = index === 7;
    return {
      month: index + 1,
      label: august ? 'avgust' : `oy-${index + 1}`,
      periodId: `period-${index + 1}`,
      factRevenueUzs: august ? '302841471' : '0',
      ownershipPercent: 2,
      shareUzs: august ? '6056829.42' : '0.00',
      paidUzs: '0.00',
      openUzs: '0.00',
      remainingUzs: august ? '6056829.42' : '0.00',
      payableUzs: august ? '6056829' : '0',
      residualUzs: august ? '0.42' : '0.00',
      isSettled: !august,
      requests: [],
    };
  });

  return {
    investor: INVESTOR,
    year: 2026,
    annual: {
      factRevenueUzs: '302841471',
      shareUzs: '6056829.42',
      paidUzs: '0.00',
      openUzs: '0.00',
      remainingUzs: '6056829.42',
      payableUzs: '6056829',
      residualUzs: '0.42',
      isSettled: false,
    },
    months,
    ...overrides,
  };
}

function request(overrides: Partial<PayoutRequestRow> = {}): PayoutRequestRow {
  return {
    id: 'request-1',
    investorId: INVESTOR_ID,
    investorName: 'Ali Valiyev',
    periodId: 'period-8',
    year: 2026,
    month: 8,
    monthLabel: 'avgust',
    requestedAmountUzs: '5000000',
    calculatedShareUzs: '6056829.42',
    factRevenueUzs: '302841471',
    ownershipPercent: 2,
    status: 'approved',
    investorNote: null,
    decisionNote: 'Tasdiqlandi',
    decidedAt: '2026-09-01T10:00:00.000Z',
    decidedByName: 'Direktor',
    paidOn: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

/** The 014 side: the payment ledger and any hand-recorded figure. */
function recorded(entitled = '0', payments: unknown[] = []) {
  return {
    investor: INVESTOR,
    year: 2026,
    annual: {
      entitledAmountUzs: entitled,
      paidAmountUzs: '0',
      remainingAmountUzs: entitled,
      overpaidAmountUzs: '0',
      paidPercent: 0,
      remainingPercent: entitled === '0' ? 0 : 100,
      settledPercent: 0,
      status: 'unpaid',
    },
    months: [],
    payments,
  };
}

function renderPage(element: JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  selectedPeriod.current = { year: 2026, month: 8, periodId: 'period-8' };
  vi.mocked(investorApi.dashboard).mockResolvedValue(recorded() as never);
});

describe('Investor detail — director view', () => {
  it('shows capital, start month and payment method separately from payouts', async () => {
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    await screen.findByRole('heading', { name: 'Investor kapitali' });
    const capital = card('Investor kapitali');
    expect(plain(capital.textContent ?? '')).toContain('100 000 000 so‘m');
    expect(capital).toHaveTextContent('Avgust 2026');
    expect(capital).toHaveTextContent('Bank o‘tkazmasi');
  });

  it('shows the share derived from actual revenue, not a recorded figure', async () => {
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    // 302 841 471 x 2% = 6 056 829,42 — the same number the investor sees.
    expect(await findText('6 056 829,42 so‘m')).not.toHaveLength(0);
    expect(await findText('302 841 471 so‘m')).not.toHaveLength(0);
  });

  it('follows the month the app bar selected, with no picker of its own', async () => {
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    await screen.findByText('Ali Valiyev');
    expect(screen.getByText(/avgust 2026 — hisob-kitob/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Oy/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Yil/)).not.toBeInTheDocument();
  });

  it('shows a different month when the bar points at one', async () => {
    selectedPeriod.current = { year: 2026, month: 1, periodId: 'period-1' };
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    await screen.findByText('Ali Valiyev');
    // January has no revenue. The yearly table below still lists August, so this
    // has to look at the month card itself.
    const january = card(/oy-1 2026 — hisob-kitob/i);
    expect(plain(january.textContent ?? '')).toContain('0,00 so‘m');
    expect(plain(january.textContent ?? '')).not.toContain('6 056 829,42');
  });

  it('falls back to the whole year when the bar names no month', async () => {
    selectedPeriod.current = { year: 2026, month: null, periodId: null };
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    await screen.findByText('Ali Valiyev');
    expect(screen.getByText('2026-yil — hisob-kitob')).toBeInTheDocument();
    // Nothing to choose between, so the Oylik/Yillik switch is not offered.
    expect(screen.queryByRole('tablist', { name: 'Hisob davri' })).not.toBeInTheDocument();
    expect(await findText('6 056 829,42 so‘m')).not.toHaveLength(0);
  });

  it('switches between the month and the year', async () => {
    const data = summary();
    // A year that is deliberately NOT the sum of the rounded months, so the two
    // views cannot be confused for one another.
    data.annual = {
      factRevenueUzs: '1000000000',
      shareUzs: '20000000.00',
      paidUzs: '0.00',
      openUzs: '0.00',
      remainingUzs: '20000000.00',
      payableUzs: '20000000',
      residualUzs: '0.00',
      isSettled: false,
    };
    vi.mocked(payoutApi.summary).mockResolvedValue(data);
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    // Starts on the month the app bar named.
    await screen.findByText('avgust 2026 — hisob-kitob');
    expect(plain(card(/avgust 2026 — hisob-kitob/).textContent ?? '')).toContain('6 056 829,42');

    await userEvent.click(screen.getByRole('tab', { name: 'Yillik' }));

    const annual = card('2026-yil — hisob-kitob');
    const text = plain(annual.textContent ?? '');
    expect(text).toContain('1 000 000 000 so‘m');
    expect(text).toContain('20 000 000,00 so‘m');
    expect(text).toContain('2%');
  });

  it('shows the payable amount and the sub-so‘m residual for the year', async () => {
    const data = summary();
    data.annual = {
      factRevenueUzs: '1000000037',
      shareUzs: '20000000.74',
      paidUzs: '0.00',
      openUzs: '0.00',
      remainingUzs: '20000000.74',
      payableUzs: '20000000',
      residualUzs: '0.74',
      isSettled: false,
    };
    vi.mocked(payoutApi.summary).mockResolvedValue(data);
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    await screen.findByText('avgust 2026 — hisob-kitob');
    await userEvent.click(screen.getByRole('tab', { name: 'Yillik' }));

    const text = plain(card('2026-yil — hisob-kitob').textContent ?? '');
    expect(text).toContain('20 000 000 so‘m');
    expect(text).toContain('0,74 so‘m');
  });

  it('says the year is calculated once, not summed from the months', async () => {
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    await screen.findByText('avgust 2026 — hisob-kitob');
    await userEvent.click(screen.getByRole('tab', { name: 'Yillik' }));
    expect(screen.getByText(/bir marta hisoblanadi/)).toBeInTheDocument();
  });

  it('lists all twelve months', async () => {
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    const table = await screen.findByRole('table', {
      name: /Oylar bo‘yicha fakt tushum, ulush va to‘lov holati/,
    });
    // One header row plus twelve months.
    expect(within(table).getAllByRole('row')).toHaveLength(13);
  });

  it('shows the requests raised against the share', async () => {
    const data = summary();
    data.months[7] = { ...data.months[7]!, requests: [request()] };
    vi.mocked(payoutApi.summary).mockResolvedValue(data);
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    const table = await screen.findByRole('table', { name: /to‘lov so‘rovlari/i });
    expect(within(table).getByText('Tasdiqlangan')).toBeInTheDocument();
    expect(plain(table.textContent ?? '')).toContain('5 000 000 so‘m');
  });

  it('says so plainly when no request was ever raised', async () => {
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);
    expect(await screen.findByText(/to‘lov so‘rovi yuborilmagan/)).toBeInTheDocument();
  });

  it('keeps a reversed payment visible rather than deleting it', async () => {
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    vi.mocked(investorApi.dashboard).mockResolvedValue(
      recorded('0', [
        {
          id: 'p1',
          paidOn: '2026-08-20',
          amountUzs: '5000000',
          status: 'reversed',
          note: null,
          reversalReason: 'Xato kiritilgan',
          createdAt: '2026-08-20T10:00:00.000Z',
        },
      ]) as never,
    );
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    expect(await screen.findByText('Bekor qilingan')).toBeInTheDocument();
    expect(screen.getByText('Xato kiritilgan')).toBeInTheDocument();
  });

  it('hides the hand-recorded figure when nobody recorded one', async () => {
    // A row of zeros beside a real calculation is what made the old page read
    // as though the investor was owed nothing.
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    await screen.findByText('Ali Valiyev');
    await waitFor(() =>
      expect(screen.queryByText('Qo‘lda qayd etilgan summa')).not.toBeInTheDocument(),
    );
  });

  it('shows the hand-recorded figure when there is one', async () => {
    vi.mocked(payoutApi.summary).mockResolvedValue(summary());
    vi.mocked(investorApi.dashboard).mockResolvedValue(recorded('10000000') as never);
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);

    expect(await screen.findByText('Qo‘lda qayd etilgan summa')).toBeInTheDocument();
    expect(plain(card('Qo‘lda qayd etilgan summa').textContent ?? '')).toContain('10 000 000 so‘m');
  });

  it('shows a loading state before the request resolves', () => {
    vi.mocked(payoutApi.summary).mockReturnValue(new Promise(() => {}) as never);
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);
    expect(screen.getByText(/yuklanmoqda/i)).toBeInTheDocument();
  });

  it('shows an error state when the request is refused', async () => {
    vi.mocked(payoutApi.summary).mockRejectedValue(new Error('403'));
    renderPage(<InvestorDetailPage investorId={INVESTOR_ID} />);
    expect(await screen.findByText(/ruxsat yo‘q/i)).toBeInTheDocument();
  });
});

describe('Investor list — director view', () => {
  it('shows the share, not the recorded entitlement', async () => {
    vi.mocked(payoutApi.list).mockResolvedValue([
      { ...INVESTOR, annual: summary().annual },
    ] as never);
    renderPage(<InvestorListPage />);

    const table = await screen.findByRole('table', { name: /2026-yil investorlari/ });
    const text = plain(table.textContent ?? '');
    expect(text).toContain('302 841 471 so‘m');
    expect(text).toContain('6 056 829,42 so‘m');
  });

  it('reports capital separately by contribution payment method', async () => {
    vi.mocked(payoutApi.list).mockResolvedValue([
      { ...INVESTOR, annual: summary().annual },
    ] as never);
    renderPage(<InvestorListPage />);

    await screen.findByRole('table', { name: /2026-yil investorlari/ });
    const capitalCard = (label: string) => screen.getByText(label).closest('div.relative')!;
    expect(plain(capitalCard('Jami investor kapitali').textContent ?? '')).toContain(
      '100 000 000 so‘m',
    );
    expect(plain(capitalCard('Bank o‘tkazmasi').textContent ?? '')).toContain(
      '100 000 000 so‘m',
    );
    expect(plain(capitalCard('Naqd').textContent ?? '')).toContain('0 so‘m');
  });

  it('links each investor to their own page', async () => {
    vi.mocked(payoutApi.list).mockResolvedValue([
      { ...INVESTOR, annual: summary().annual },
    ] as never);
    renderPage(<InvestorListPage />);

    const link = await screen.findByRole('link', { name: 'Ali Valiyev' });
    expect(link).toHaveAttribute('href', `/investors/${INVESTOR_ID}`);
  });

  it('shows an empty state when no investor is recorded', async () => {
    vi.mocked(payoutApi.list).mockResolvedValue([] as never);
    renderPage(<InvestorListPage />);
    expect(await screen.findByText('Investor qayd etilmagan')).toBeInTheDocument();
  });
});
