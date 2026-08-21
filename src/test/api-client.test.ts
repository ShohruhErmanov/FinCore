import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('[FE-API-01] typed API transport', () => {
  it('cookie credentials va body bilan bir xil Idempotency-Key yuboradi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'expense-1',
        amountUzs: '125000',
        createdAt: '2026-08-21T10:00:00+05:00',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/expenses', { amountUzs: '125000', idempotencyKey: 'stable-request-key' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('stable-request-key');
    expect(JSON.parse(String(init.body))).toMatchObject({ idempotencyKey: 'stable-request-key' });
  });

  it('noto‘g‘ri MoneyUzs response’ni render qatlamiga o‘tkazmaydi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ amountUzs: 125000 })));

    await expect(api.get('/bad-money')).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_API_RESPONSE',
    });
  });

  it('offsetsiz timestamp response’ni xavfsiz 502 kontrakt xatosiga aylantiradi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ paymentAt: '2026-08-21T10:00:00' })),
    );

    await expect(api.get('/bad-time')).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_API_RESPONSE',
    });
  });

  it('DQ exception ichidagi legacy raw text-date qiymatini ko‘rinadigan saqlaydi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: 'dq-1',
              issueType: 'invalid_date',
              transactionDate: '15.08.2026',
              amountUzs: '250000',
              createdAt: '2026-08-21T10:00:00+05:00',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          nextCursor: null,
        }),
      ),
    );

    await expect(api.get('/reports/data-quality')).resolves.toMatchObject({
      items: [{ transactionDate: '15.08.2026' }],
    });
  });
});
