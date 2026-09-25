import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MySharePage, PayoutRequestsPage } from '@/features/investors/PayoutPages';
import { authApi, payoutApi } from '@/shared/api/contracts';
import { ToastProvider } from '@/shared/ui';
import type { PayoutRequestRow, PayoutSummary } from '@/shared/types/domain';

vi.mock('@/shared/api/contracts', () => ({
  payoutApi: {
    mine: vi.fn(),
    summary: vi.fn(),
    queue: vi.fn(),
    request: vi.fn(),
    decide: vi.fn(),
    markPaid: vi.fn(),
    cancel: vi.fn(),
  },
  authApi: { me: vi.fn() },
  referenceApi: { periods: vi.fn() },
}));

// The page reads the app bar's period through this hook; stubbing it keeps the
// tests about the payout screens rather than about period plumbing.
const selectedPeriod = vi.hoisted(() => ({
  current: { year: 2026, month: 8 as number | null, periodId: 'period-8' as string | null },
}));
vi.mock('@/features/investors/use-selected-period', () => ({
  useSelectedPeriod: () => selectedPeriod.current,
}));

const INVESTOR_ID = '44444444-0000-4000-8000-000000000001';

/** Non-breaking spaces make exact text matching brittle. */
const plain = (value: string) => value.replace(/\u00a0/g, ' ');

/**
 * Finds text by its rendered content. Uses findAllBy because a textContent
 * matcher also matches every ancestor that wraps only that text.
 */
const findText = (expected: string) =>
  screen.findAllByText((_, node) => plain(node?.textContent ?? '') === expected);

function summary(overrides: Partial<PayoutSummary['annual']> = {}): PayoutSummary {
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
    investor: {
      id: INVESTOR_ID,
      userId: 'user-1',
      fullName: 'Ali Valiyev',
      phone: '+998901112233',
      ownershipPercent: 2,
      branch: null,
      isActive: true,
    },
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
      ...overrides,
    },
    months,
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
    requestedAmountUzs: '6056829',
    calculatedShareUzs: '6056829.42',
    factRevenueUzs: '302841471',
    ownershipPercent: 2,
    status: 'pending',
    investorNote: null,
    decisionNote: null,
    decidedAt: null,
    decidedByName: null,
    paidOn: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderPage(element: JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{element}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  selectedPeriod.current = { year: 2026, month: 8, periodId: 'period-8' };
  vi.mocked(authApi.me).mockResolvedValue({
    permissions: ['investor.settlement.approve', 'investor.settlement.pay'],
  } as never);
});

// ------------------------------------------------------------------ investor

describe('Foyda ulushim', () => {
  it('shows the exact share, tiyin and all', async () => {
    vi.mocked(payoutApi.mine).mockResolvedValue(summary());
    renderPage(<MySharePage />);

    // 302 841 471 x 2% = 6 056 829,42 — the decimals survive to the screen.
    expect(await findText('6 056 829,42 so‘m')).not.toHaveLength(0);
  });

  it('shows actual revenue as whole so‘m, not as a decimal', async () => {
    vi.mocked(payoutApi.mine).mockResolvedValue(summary());
    renderPage(<MySharePage />);
    expect(await findText('302 841 471 so‘m')).not.toHaveLength(0);
  });

  it('caps the request at the whole so‘m that can actually be paid', async () => {
    vi.mocked(payoutApi.mine).mockResolvedValue(summary());
    renderPage(<MySharePage />);

    await screen.findByLabelText(/So‘raladigan summa/);
    expect(plain(screen.getByText(/Shu oy uchun eng ko‘pi/).textContent ?? '')).toContain(
      '6 056 829 so‘m',
    );
  });

  it('refuses to submit more than is available, before the server is asked', async () => {
    vi.mocked(payoutApi.mine).mockResolvedValue(summary());
    renderPage(<MySharePage />);

    const field = await screen.findByLabelText(/So‘raladigan summa/);
    await userEvent.type(field, '6056830');

    expect(screen.getByRole('button', { name: /So‘rov yuborish/ })).toBeDisabled();
    expect(payoutApi.request).not.toHaveBeenCalled();
  });

  it('sends the period from the app bar and no investor id', async () => {
    vi.mocked(payoutApi.mine).mockResolvedValue(summary());
    vi.mocked(payoutApi.request).mockResolvedValue(request());
    renderPage(<MySharePage />);

    await userEvent.type(await screen.findByLabelText(/So‘raladigan summa/), '1000000');
    await userEvent.click(screen.getByRole('button', { name: /So‘rov yuborish/ }));

    await waitFor(() => expect(payoutApi.request).toHaveBeenCalledTimes(1));
    const [input] = vi.mocked(payoutApi.request).mock.calls[0]!;
    expect(input).toEqual({ periodId: 'period-8', amountUzs: '1000000' });
    // Whose share it is, is the server's business — never a field on the wire.
    expect(Object.keys(input)).not.toContain('investorId');
  });

  it('asks for a month when the app bar has not named one', async () => {
    selectedPeriod.current = { year: 2026, month: null, periodId: null };
    vi.mocked(payoutApi.mine).mockResolvedValue(summary());
    renderPage(<MySharePage />);

    expect(await screen.findByText(/tepadagi paneldan oyni tanlang/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/So‘raladigan summa/)).not.toBeInTheDocument();
  });

  it('closes the form for a month that is fully settled', async () => {
    const data = summary();
    data.months[7] = {
      ...data.months[7]!,
      paidUzs: '6056829.00',
      remainingUzs: '0.42',
      payableUzs: '0',
      isSettled: true,
    };
    vi.mocked(payoutApi.mine).mockResolvedValue(data);
    renderPage(<MySharePage />);

    expect(await screen.findByText('Bu oy yopilgan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /So‘rov yuborish/ })).not.toBeInTheDocument();
  });

  it('keeps the sub-so‘m remainder visible rather than rounding it away', async () => {
    const data = summary();
    data.months[7] = {
      ...data.months[7]!,
      paidUzs: '6056829.00',
      remainingUzs: '0.42',
      payableUzs: '0',
      isSettled: true,
    };
    vi.mocked(payoutApi.mine).mockResolvedValue(data);
    renderPage(<MySharePage />);

    await screen.findByText('Bu oy yopilgan');
    expect(screen.getAllByText(/0,42 so‘m/).length).toBeGreaterThan(0);
  });

  it('switches to the year without losing the payout form', async () => {
    const data = summary();
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
    vi.mocked(payoutApi.mine).mockResolvedValue(data);
    renderPage(<MySharePage />);

    await screen.findByRole('tab', { name: 'Yillik' });
    await userEvent.click(screen.getByRole('tab', { name: 'Yillik' }));

    expect(await findText('20 000 000,00 so‘m')).not.toHaveLength(0);
    // A payout is still requested per month — the year is a read-only view.
    expect(screen.getByLabelText(/So‘raladigan summa/)).toBeInTheDocument();
  });

  it('returns to the month when asked', async () => {
    vi.mocked(payoutApi.mine).mockResolvedValue(summary());
    renderPage(<MySharePage />);

    await userEvent.click(await screen.findByRole('tab', { name: 'Yillik' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Oylik' }));
    expect(screen.getByText('avgust 2026 — hisob-kitob')).toBeInTheDocument();
  });

  it('lets the investor withdraw a pending request', async () => {
    const data = summary();
    data.months[7] = { ...data.months[7]!, requests: [request()] };
    vi.mocked(payoutApi.mine).mockResolvedValue(data);
    vi.mocked(payoutApi.cancel).mockResolvedValue(request({ status: 'cancelled' }));
    renderPage(<MySharePage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Qaytarib olish' }));
    await waitFor(() => expect(payoutApi.cancel).toHaveBeenCalledWith('request-1'));
  });

  it('offers no withdrawal once a request is paid', async () => {
    const data = summary();
    data.months[7] = { ...data.months[7]!, requests: [request({ status: 'paid' })] };
    vi.mocked(payoutApi.mine).mockResolvedValue(data);
    renderPage(<MySharePage />);

    // Scoped to the history table: 'To‘langan' is also a column header above.
    const history = await screen.findByRole('table', { name: /Yuborilgan to‘lov so‘rovlari/ });
    expect(within(history).getByText('To‘langan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Qaytarib olish' })).not.toBeInTheDocument();
  });
});

// ------------------------------------------------------------------ director

describe('To‘lov so‘rovlari', () => {
  it('approves without a dialog, because approval needs no reason', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([request()]);
    vi.mocked(payoutApi.decide).mockResolvedValue(request({ status: 'approved' }));
    renderPage(<PayoutRequestsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() =>
      expect(payoutApi.decide).toHaveBeenCalledWith('request-1', 'approved', undefined),
    );
  });

  it('will not reject until a reason is written', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([request()]);
    renderPage(<PayoutRequestsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Rad etish' }));
    const dialog = await screen.findByRole('dialog');

    // The confirm button inside the dialog, not the one in the table row.
    const confirm = within(dialog).getByRole('button', { name: 'Rad etish' });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/Sabab/), 'Byudjet yetarli emas');
    expect(confirm).toBeEnabled();
  });

  it('sends the rejection reason the director typed', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([request()]);
    vi.mocked(payoutApi.decide).mockResolvedValue(request({ status: 'rejected' }));
    renderPage(<PayoutRequestsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Rad etish' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Sabab/), 'Byudjet yetarli emas');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rad etish' }));

    await waitFor(() =>
      expect(payoutApi.decide).toHaveBeenCalledWith(
        'request-1',
        'rejected',
        'Byudjet yetarli emas',
      ),
    );
  });

  it('offers payment only on an approved request', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([request()]);
    renderPage(<PayoutRequestsPage />);

    await screen.findByRole('button', { name: 'Tasdiqlash' });
    expect(screen.queryByRole('button', { name: /To‘lash/ })).not.toBeInTheDocument();
  });

  it('defaults the payment date to the last day of the requested month', async () => {
    // The payment's period is derived from its date, so a September default
    // would file August's money against the wrong month.
    vi.mocked(payoutApi.queue).mockResolvedValue([request({ status: 'approved' })]);
    renderPage(<PayoutRequestsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /To‘lash/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/To‘lov sanasi/)).toHaveValue('2026-08-31');
  });

  it('marks the request paid with that date', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([request({ status: 'approved' })]);
    vi.mocked(payoutApi.markPaid).mockResolvedValue(request({ status: 'paid' }));
    renderPage(<PayoutRequestsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /To‘lash/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'To‘landi deb belgilash' }));

    await waitFor(() =>
      expect(payoutApi.markPaid).toHaveBeenCalledWith('request-1', '2026-08-31', undefined),
    );
  });

  it('hides the payment button from a director who may only approve', async () => {
    vi.mocked(authApi.me).mockResolvedValue({
      permissions: ['investor.settlement.approve'],
    } as never);
    vi.mocked(payoutApi.queue).mockResolvedValue([request({ status: 'approved' })]);
    renderPage(<PayoutRequestsPage />);

    await screen.findByText('Tasdiqlangan');
    expect(screen.queryByRole('button', { name: /To‘lash/ })).not.toBeInTheDocument();
  });

  it('keeps the Business Owner payout queue completely read-only', async () => {
    vi.mocked(authApi.me).mockResolvedValue({
      roles: [{ role: 'business_owner' }],
      permissions: ['investor.view_all'],
    } as never);
    vi.mocked(payoutApi.queue).mockResolvedValue([request()]);
    renderPage(<PayoutRequestsPage />);

    await screen.findByText('Kutilmoqda');
    expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rad etish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /To‘lash/ })).not.toBeInTheDocument();
  });

  it('never offers to edit the amount — it comes from the request', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([request({ status: 'approved' })]);
    renderPage(<PayoutRequestsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /To‘lash/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/summa/i)).not.toBeInTheDocument();
  });

  it('shows the share snapshot the decision was made against', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([request()]);
    renderPage(<PayoutRequestsPage />);
    expect(await findText('6 056 829,42 so‘m')).not.toHaveLength(0);
  });

  it('totals what is approved but still unpaid', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([
      request({ id: 'a', status: 'approved', requestedAmountUzs: '1000000' }),
      request({ id: 'b', status: 'approved', requestedAmountUzs: '2000000' }),
      request({ id: 'c', status: 'pending', requestedAmountUzs: '9000000' }),
    ]);
    renderPage(<PayoutRequestsPage />);

    expect(await findText('3 000 000 so‘m')).not.toHaveLength(0);
  });

  it('says so plainly when the queue is empty', async () => {
    vi.mocked(payoutApi.queue).mockResolvedValue([]);
    renderPage(<PayoutRequestsPage />);
    expect(await screen.findByText(/Ko‘rib chiqilmagan so‘rov yo‘q/)).toBeInTheDocument();
  });
});
