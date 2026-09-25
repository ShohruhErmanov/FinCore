import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/auth-context';
import { ProtectedRoute } from '@/features/auth/auth-guards';

afterEach(() => vi.unstubAllGlobals());

describe('expired session bootstrap', () => {
  it('finishes the /me check and redirects to login instead of spinning forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Sessiya tugagan. Qayta kiring.' }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<h1>Login sahifasi</h1>} />
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<h1>Dashboard</h1>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Login sahifasi' })).toBeInTheDocument();
    expect(screen.queryByText('Sessiya tekshirilmoqda…')).not.toBeInTheDocument();
  });
});
