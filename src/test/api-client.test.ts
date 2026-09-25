import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, onSessionExpired } from '@/shared/api/client';

function respond(body: string, init: { status?: number; contentType?: string }) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.contentType ? { 'content-type': init.contentType } : {},
  });
}

function mockFetch(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('[FE-API-01] backend ulanmagan deployment', () => {
  it('JSON o‘rniga HTML kelsa xato beradi — bo‘sh javob deb qabul qilmaydi', async () => {
    mockFetch(respond('<!doctype html><html></html>', { contentType: 'text/html' }));

    await expect(apiRequest('/me')).rejects.toMatchObject({
      code: 'API_UNAVAILABLE',
      status: 502,
    });
  });

  it('405 (Method Not Allowed) da aniq sabab ko‘rsatadi', async () => {
    mockFetch(respond('<!doctype html>', { status: 405, contentType: 'text/html' }));

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'API_UNAVAILABLE',
    });
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toThrow(
      /VITE_ENABLE_MOCKS/,
    );
  });

  it('haqiqiy JSON xatoni o‘zgartirmaydi', async () => {
    mockFetch(
      respond(JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Parol noto‘g‘ri.' }), {
        status: 401,
        contentType: 'application/json',
      }),
    );

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
  });

  it('himoyalangan so‘rovdagi 401 eskirgan sessiyani darhol bildiradi', async () => {
    mockFetch(
      respond(JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Sessiya tugagan.' }), {
        status: 401,
        contentType: 'application/json',
      }),
    );
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);

    await expect(apiRequest('/investor-payouts/me')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('noto‘g‘ri loginni mavjud sessiya tugashi deb talqin qilmaydi', async () => {
    mockFetch(
      respond(JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Parol noto‘g‘ri.' }), {
        status: 401,
        contentType: 'application/json',
      }),
    );
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
    });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('/me o‘z 401 javobini query ichida yakunlaydi, listener orqali o‘zini mutatsiya qilmaydi', async () => {
    mockFetch(
      respond(JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Sessiya tugagan.' }), {
        status: 401,
        contentType: 'application/json',
      }),
    );
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);

    await expect(apiRequest('/me')).rejects.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('to‘g‘ri JSON javobni qaytaradi', async () => {
    mockFetch(
      respond(JSON.stringify({ id: 'u1', amountUzs: '5000' }), {
        contentType: 'application/json; charset=utf-8',
      }),
    );

    await expect(apiRequest('/me')).resolves.toEqual({ id: 'u1', amountUzs: '5000' });
  });

  it('investor ulushining ikki kasrli ShareUzs qiymatlarini qabul qiladi', async () => {
    // Every field of PayoutAvailability, so a new decimal field that nobody
    // added to shareValueKeys fails here rather than in the browser. That is
    // exactly how residualUzs broke the Investorlar page.
    const payload = {
      annual: {
        factRevenueUzs: '313841471',
        shareUzs: '6056829.42',
        paidUzs: '0.00',
        openUzs: '0.00',
        remainingUzs: '6056829.42',
        payableUzs: '6056829',
        residualUzs: '0.42',
      },
      requests: [{ calculatedShareUzs: '6056829.42', requestedAmountUzs: '6056829' }],
    };
    mockFetch(
      respond(JSON.stringify(payload), { contentType: 'application/json; charset=utf-8' }),
    );

    await expect(apiRequest('/investor-payouts/me')).resolves.toEqual(payload);
  });

  it('ShareUzs maydonida butun songa ham ikki kasr talab qiladi', async () => {
    // A share is always two decimals; "6056829" would mean the server rounded
    // somewhere it should not have.
    mockFetch(
      respond(JSON.stringify({ annual: { residualUzs: '0' } }), {
        contentType: 'application/json; charset=utf-8',
      }),
    );

    await expect(apiRequest('/investor-payouts/me')).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      status: 502,
    });
  });

  it('oddiy MoneyUzs maydonida kasrli qiymatni hanuz rad etadi', async () => {
    mockFetch(
      respond(JSON.stringify({ amountUzs: '100.50' }), {
        contentType: 'application/json; charset=utf-8',
      }),
    );

    await expect(apiRequest('/expenses')).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      status: 502,
    });
  });

  it('204 javobda tanani o‘qimaydi', async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('ApiError klassi sifatida uzatiladi', async () => {
    mockFetch(respond('<!doctype html>', { contentType: 'text/html' }));

    await expect(apiRequest('/me')).rejects.toBeInstanceOf(ApiError);
  });
});
