import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { ApiError } from '@/shared/api/client';
import type { TelegramLinkStatus, TelegramSettings } from '@/shared/types/domain';
import { ToastProvider } from '@/shared/ui';

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  saveSettings: vi.fn(),
  reminderPreview: vi.fn(),
  monthlyPreview: vi.fn(),
  sendTest: vi.fn(),
  linkStatus: vi.fn(),
  createLink: vi.fn(),
  unlink: vi.fn(),
  users: vi.fn(),
  periods: vi.fn(),
}));

vi.mock('@/shared/api/contracts', () => ({
  notificationApi: {
    settings: mocks.settings,
    saveSettings: mocks.saveSettings,
    reminderPreview: mocks.reminderPreview,
    monthlyPreview: mocks.monthlyPreview,
    sendTest: mocks.sendTest,
    linkStatus: mocks.linkStatus,
    createLink: mocks.createLink,
    unlink: mocks.unlink,
  },
  referenceApi: { users: mocks.users, periods: mocks.periods },
}));

const settings: TelegramSettings = {
  enabled: true,
  botTokenSet: true,
  dailyReminderEnabled: true,
  reminderTimeLocal: '20:00',
  monthlyReportEnabled: true,
  monthlyReportDay: 1,
  recipients: [],
};

const linkState = (status: TelegramLinkStatus['status']): TelegramLinkStatus => ({
  status,
  telegramUsername: status === 'linked' ? 'ali' : null,
  displayName: status === 'linked' ? 'Ali' : null,
  linkedAt: status === 'linked' ? '2026-08-20T10:00:00.000Z' : null,
  pendingExpiresAt: status === 'pending' ? '2026-08-20T10:10:00.000Z' : null,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <NotificationsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('NotificationsPage — Telegram linking (PHASE 38)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue(settings);
    mocks.users.mockResolvedValue([
      { id: 'u1', fullName: 'Ali Valiyev', status: 'active', roles: [] },
    ]);
    mocks.periods.mockResolvedValue([]);
    mocks.reminderPreview.mockResolvedValue({ businessDate: '2026-08-20', branches: [] });
    mocks.monthlyPreview.mockResolvedValue({ periodLabel: '', message: '', recipients: [] });
    mocks.linkStatus.mockResolvedValue(linkState('unlinked'));
  });

  it('offers to connect while the account is unlinked', async () => {
    renderPage();
    expect(await screen.findByText('Telegram hali ulanmagan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Telegramni ulash/ })).toBeInTheDocument();
  });

  it('shows the deep link and its expiry after connecting', async () => {
    mocks.createLink.mockResolvedValue({
      deepLink: 'https://t.me/fincore_bot?start=abc123',
      expiresAt: '2026-08-20T10:10:00.000Z',
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Telegramni ulash/ }));

    const opener = await screen.findByRole('link', { name: 'Telegramda ochish' });
    expect(opener).toHaveAttribute('href', 'https://t.me/fincore_bot?start=abc123');
    expect(screen.getByText(/Amal qiladi:/)).toBeInTheDocument();
    // The frontend never mints a token — it only asks the backend for one.
    expect(mocks.createLink).toHaveBeenCalledWith();
  });

  it('lets the user retry while a link is pending', async () => {
    mocks.linkStatus.mockResolvedValue(linkState('pending'));
    renderPage();
    expect(
      await screen.findByText('Havola yuborilgan — Telegramda botga /start yozing.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yangi havola olish/ })).toBeInTheDocument();
  });

  it('shows a safe linked status with no identifiers', async () => {
    mocks.linkStatus.mockResolvedValue(linkState('linked'));
    const { container } = renderPage();

    expect(await screen.findByText(/Telegram ulangan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Uzish/ })).toBeInTheDocument();
    // No identifier is rendered and nothing invites one: a chat id is at least
    // five digits, and no field accepts one.
    expect(container.textContent).not.toMatch(/\b-?\d{5,}\b/);
    expect(container.querySelector('input[placeholder*="Chat" i]')).toBeNull();
  });

  it('asks for confirmation before unlinking and calls the backend', async () => {
    mocks.linkStatus.mockResolvedValue(linkState('linked'));
    mocks.unlink.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Uzish/ }));

    await waitFor(() => expect(mocks.unlink).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('does not unlink when the confirmation is dismissed', async () => {
    mocks.linkStatus.mockResolvedValue(linkState('linked'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Uzish/ }));

    expect(mocks.unlink).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('surfaces a backend refusal instead of failing silently', async () => {
    mocks.createLink.mockRejectedValue(
      new ApiError(409, { code: 'TELEGRAM_DISABLED', message: 'Telegram yoqilmagan.' }),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Telegramni ulash/ }));

    expect(await screen.findByText('Telegram yoqilmagan.')).toBeInTheDocument();
  });

  it('never offers a bot token or chat id field', async () => {
    renderPage();
    await screen.findByText('Telegram hali ulanmagan.');

    expect(screen.queryByLabelText(/Bot tokeni/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Chat ID/i)).not.toBeInTheDocument();
    expect(screen.getByText(/server sozlamalarida tayyor/)).toBeInTheDocument();
  });

  it('sends the test message to the caller’s own chat, with no destination', async () => {
    mocks.sendTest.mockResolvedValue({ delivered: false, note: 'DEMO_NO_BACKEND' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /sinov xabari/i }));

    await waitFor(() => expect(mocks.sendTest).toHaveBeenCalledWith());
  });
});
