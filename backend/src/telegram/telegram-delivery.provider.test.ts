import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '@/config';
import { TelegramDeliveryProvider } from './telegram-delivery.provider';

const TOKEN = '123456:AA-super-secret-bot-token';
const env = (over: Partial<AppEnv> = {}): AppEnv =>
  ({ TELEGRAM_ENABLED: true, TELEGRAM_BOT_TOKEN: TOKEN, ...over }) as unknown as AppEnv;

const request = { chatId: 555_666_777n, text: 'FinCore xabari' };

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TelegramDeliveryProvider', () => {
  it('reports success and the provider message id', async () => {
    const fetchMock = respond(200, { ok: true, result: { message_id: 42 } });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await new TelegramDeliveryProvider(env()).send(request);

    expect(outcome).toEqual({ kind: 'success', providerMessageId: '42' });
    // The destination is sent as a string, and it is the one we were handed.
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ chat_id: '555666777', text: 'FinCore xabari' });
  });

  it('treats a timeout as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })));
    const outcome = await new TelegramDeliveryProvider(env()).send(request);
    expect(outcome).toMatchObject({ kind: 'retryable', errorCode: 'TELEGRAM_TIMEOUT' });
  });

  it('treats a network failure as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));
    const outcome = await new TelegramDeliveryProvider(env()).send(request);
    expect(outcome).toMatchObject({ kind: 'retryable', errorCode: 'TELEGRAM_NETWORK_ERROR' });
  });

  it('treats a 5xx as retryable', async () => {
    vi.stubGlobal('fetch', respond(502, { ok: false, error_code: 502, description: 'Bad Gateway' }));
    const outcome = await new TelegramDeliveryProvider(env()).send(request);
    expect(outcome).toMatchObject({ kind: 'retryable', errorCode: 'TELEGRAM_HTTP_502' });
  });

  it('treats 429 as retryable and carries retry_after', async () => {
    vi.stubGlobal('fetch', respond(429, { ok: false, error_code: 429, parameters: { retry_after: 30 } }));
    const outcome = await new TelegramDeliveryProvider(env()).send(request);
    expect(outcome).toEqual({
      kind: 'retryable',
      errorCode: 'TELEGRAM_RATE_LIMITED',
      retryAfterMs: 30_000,
    });
  });

  it('handles 429 without a retry_after hint', async () => {
    vi.stubGlobal('fetch', respond(429, { ok: false, error_code: 429 }));
    const outcome = await new TelegramDeliveryProvider(env()).send(request);
    expect(outcome).toEqual({ kind: 'retryable', errorCode: 'TELEGRAM_RATE_LIMITED' });
  });

  it.each([400, 401, 403, 404])('treats a deterministic %i as permanent', async (status) => {
    vi.stubGlobal('fetch', respond(status, { ok: false, error_code: status, description: 'nope' }));
    const outcome = await new TelegramDeliveryProvider(env()).send(request);
    expect(outcome).toEqual({ kind: 'permanent', errorCode: `TELEGRAM_HTTP_${status}` });
  });

  it('fails permanently and never calls out when Telegram is disabled', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await new TelegramDeliveryProvider(env({ TELEGRAM_ENABLED: false })).send(request);

    expect(outcome).toEqual({ kind: 'permanent', errorCode: 'TELEGRAM_DISABLED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never leaks the bot token through an outcome', async () => {
    // A fetch rejection can echo the request URL, which contains the token.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error(`request to https://api.telegram.org/bot${TOKEN}/sendMessage failed`)),
    );

    const outcome = await new TelegramDeliveryProvider(env()).send(request);

    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
    expect(JSON.stringify(outcome)).not.toContain('123456:AA');
  });

  it('never leaks the bot token through a provider error description', async () => {
    vi.stubGlobal('fetch', respond(400, { ok: false, error_code: 400, description: `token ${TOKEN} rejected` }));
    const outcome = await new TelegramDeliveryProvider(env()).send(request);
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
  });
});
