import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '@/config';
import type { TelegramDeliveryProvider, DeliveryOutcome } from '@/telegram/telegram-delivery.provider';
import { NotificationDeliveryWorker } from './delivery-worker.service';
import type { DeliveryContext, NotificationDeliveriesRepository } from './notification-deliveries.repository';

const IDENT = '22222222-2222-4222-8222-222222222222';

const env = (over: Partial<AppEnv> = {}): AppEnv =>
  ({
    NOTIFICATION_WORKER_ENABLED: true,
    NOTIFICATION_WORKER_INTERVAL_MS: 15_000,
    NOTIFICATION_WORKER_BATCH_SIZE: 10,
    NOTIFICATION_WORKER_LEASE_SECONDS: 120,
    NOTIFICATION_MAX_ATTEMPTS: 5,
    NOTIFICATION_RETRY_BASE_MS: 30_000,
    NOTIFICATION_RETRY_MAX_MS: 3_600_000,
    ...over,
  }) as unknown as AppEnv;

const context = (over: Partial<DeliveryContext> = {}): DeliveryContext => ({
  deliveryId: 'del-1',
  recipientIdentityId: IDENT,
  channel: 'telegram',
  attempts: 1,
  eventId: 'evt-1',
  eventType: 'daily_revenue.missing',
  templateVersion: 1,
  payload: { branchId: '11111111-1111-4111-8111-111111111111', businessDate: '2026-08-20' },
  occurredAt: new Date('2026-08-20T10:00:00.000Z'),
  ...over,
});

function harness(over: { env?: Partial<AppEnv>; outcome?: DeliveryOutcome; contexts?: DeliveryContext[]; chatId?: bigint | null } = {}) {
  const contexts = over.contexts ?? [context()];
  const repo = {
    claim: vi.fn().mockResolvedValue(contexts.map((c) => ({ id: c.deliveryId }))),
    loadContext: vi.fn().mockResolvedValue(contexts),
    resolveTelegramChat: vi.fn().mockResolvedValue(over.chatId === undefined ? 999n : over.chatId),
    markDelivered: vi.fn().mockResolvedValue(undefined),
    markRetry: vi.fn().mockResolvedValue(undefined),
    markPermanentlyFailed: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationDeliveriesRepository;

  const provider = {
    channel: 'telegram' as const,
    send: vi.fn().mockResolvedValue(over.outcome ?? { kind: 'success', providerMessageId: 'tg-1' }),
  } as unknown as TelegramDeliveryProvider;

  const worker = new NotificationDeliveryWorker(repo, provider, env(over.env));
  return { repo, provider, worker };
}

beforeEach(() => vi.clearAllMocks());

describe('NotificationDeliveryWorker — lifecycle', () => {
  it('does not schedule any polling while disabled', () => {
    vi.useFakeTimers();
    const { repo, worker } = harness({ env: { NOTIFICATION_WORKER_ENABLED: false } });

    worker.onModuleInit();
    vi.advanceTimersByTime(120_000);

    expect(repo.claim).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('polls on the configured interval once enabled', async () => {
    vi.useFakeTimers();
    const { repo, worker } = harness();

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);

    expect((repo.claim as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    worker.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('skips a tick while the previous one is still running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { repo, worker } = harness();
    (repo.claim as ReturnType<typeof vi.fn>).mockImplementation(async () => { await gate; return []; });

    const first = worker.tick();
    const second = await worker.tick(); // must not enter while first is in flight

    expect(second).toBeNull();
    expect(repo.claim).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('claims nothing more after shutdown', async () => {
    const { repo, worker } = harness();
    worker.onApplicationShutdown();

    expect(await worker.tick()).toBeNull();
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it('claims with the configured batch size and lease, under its own worker id', async () => {
    const { repo, worker } = harness({ env: { NOTIFICATION_WORKER_BATCH_SIZE: 3, NOTIFICATION_WORKER_LEASE_SECONDS: 45 } });

    await worker.tick();

    expect(repo.claim).toHaveBeenCalledWith(worker.workerId, { limit: 3, leaseSeconds: 45 });
  });

  it('survives a repository failure without throwing', async () => {
    const { repo, worker } = harness();
    (repo.claim as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    await expect(worker.tick()).resolves.toBeNull();
    // The loop is usable again on the next tick.
    (repo.claim as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await expect(worker.tick()).resolves.toMatchObject({ claimed: 0 });
  });
});

describe('NotificationDeliveryWorker — delivery flow', () => {
  it('delivers and finalises under its own lease', async () => {
    const { repo, provider, worker } = harness();

    const summary = await worker.tick();

    expect(provider.send).toHaveBeenCalledWith({ chatId: 999n, text: expect.stringContaining('kiritilmagan') });
    expect(repo.markDelivered).toHaveBeenCalledWith('del-1', worker.workerId, 'tg-1');
    expect(summary).toMatchObject({ claimed: 1, delivered: 1 });
  });

  it('never calls the provider when the recipient has no linked account', async () => {
    const { repo, provider, worker } = harness({ chatId: null });

    await worker.tick();

    expect(provider.send).not.toHaveBeenCalled();
    expect(repo.markPermanentlyFailed).toHaveBeenCalledWith('del-1', worker.workerId, 'RECIPIENT_UNREACHABLE');
  });

  it('fails permanently on an unsupported event type without calling the provider', async () => {
    const { repo, provider, worker } = harness({
      contexts: [context({ eventType: 'something.unknown' })],
    });

    await worker.tick();

    expect(provider.send).not.toHaveBeenCalled();
    expect(repo.markPermanentlyFailed).toHaveBeenCalledWith('del-1', worker.workerId, 'EVENT_TYPE_UNSUPPORTED');
  });

  it('fails permanently on an unsupported channel', async () => {
    const { repo, provider, worker } = harness({ contexts: [context({ channel: 'sms' })] });

    await worker.tick();

    expect(provider.send).not.toHaveBeenCalled();
    expect(repo.markPermanentlyFailed).toHaveBeenCalledWith('del-1', worker.workerId, 'CHANNEL_UNSUPPORTED');
  });

  it('schedules a retry with exponential backoff, without touching attempts', async () => {
    const { repo, worker } = harness({
      contexts: [context({ attempts: 3 })],
      outcome: { kind: 'retryable', errorCode: 'TELEGRAM_HTTP_500' },
    });
    const before = Date.now();

    await worker.tick();

    const [, owner, code, due] = (repo.markRetry as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(owner).toBe(worker.workerId);
    expect(code).toBe('TELEGRAM_HTTP_500');
    // attempt 3 → 30s * 2^2 = 120s
    expect((due as Date).getTime() - before).toBeGreaterThanOrEqual(119_000);
    expect((due as Date).getTime() - before).toBeLessThanOrEqual(121_000);
  });

  it('lengthens the wait when the provider asks to slow down', async () => {
    const { repo, worker } = harness({
      contexts: [context({ attempts: 1 })],
      outcome: { kind: 'retryable', errorCode: 'TELEGRAM_RATE_LIMITED', retryAfterMs: 300_000 },
    });
    const before = Date.now();

    await worker.tick();

    const due = (repo.markRetry as ReturnType<typeof vi.fn>).mock.calls[0]![3] as Date;
    expect(due.getTime() - before).toBeGreaterThanOrEqual(299_000);
  });

  it('gives up permanently once the attempt budget is spent', async () => {
    const { repo, worker } = harness({
      contexts: [context({ attempts: 5 })],
      outcome: { kind: 'retryable', errorCode: 'TELEGRAM_HTTP_500' },
      env: { NOTIFICATION_MAX_ATTEMPTS: 5 },
    });

    const summary = await worker.tick();

    expect(repo.markRetry).not.toHaveBeenCalled();
    expect(repo.markPermanentlyFailed).toHaveBeenCalledWith('del-1', worker.workerId, 'MAX_ATTEMPTS_TELEGRAM_HTTP_500');
    expect(summary).toMatchObject({ permanentlyFailed: 1 });
  });

  it('keeps processing the batch when one delivery blows up', async () => {
    const contexts = [context({ deliveryId: 'del-1' }), context({ deliveryId: 'del-2' }), context({ deliveryId: 'del-3' })];
    const { repo, worker } = harness({ contexts });
    (repo.markDelivered as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === 'del-2') throw new Error('transition conflict');
    });

    const summary = await worker.tick();

    expect((repo.markDelivered as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['del-1', 'del-2', 'del-3']);
    expect(summary).toMatchObject({ claimed: 3, delivered: 2 });
  });

  it('does nothing further when nothing is due', async () => {
    const { repo, provider, worker } = harness();
    (repo.claim as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const summary = await worker.tick();

    expect(repo.loadContext).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
    expect(summary).toEqual({ claimed: 0, delivered: 0, retried: 0, permanentlyFailed: 0 });
  });

  it('addresses only the server-resolved chat, never anything from the payload', async () => {
    const { provider, worker } = harness({
      contexts: [
        context({
          // A forged destination in the event payload must be ignored entirely.
          payload: { branchId: '11111111-1111-4111-8111-111111111111', businessDate: '2026-08-20', chatId: '13371337' },
        }),
      ],
    });

    await worker.tick();

    const sent = (provider.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(sent?.chatId).toBe(999n);
    // The forged id reaches neither the destination nor the rendered text.
    expect(String(sent?.chatId)).not.toContain('13371337');
    expect(sent?.text).not.toContain('13371337');
  });
});
