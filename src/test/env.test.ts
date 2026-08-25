import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadEnvironment() {
  vi.resetModules();
  const mod = await import('@/shared/config/env');
  return mod.environment;
}

describe('shared/config/env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('falls back to /api when VITE_API_BASE_URL is unset', async () => {
    // Forced rather than assumed: a developer running against a local backend
    // has VITE_API_BASE_URL set in .env.local, and Vitest loads that file.
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    const environment = await loadEnvironment();
    expect(environment.apiBaseUrl).toBe('/api');
  });

  it('does not crash and falls back to defaults when Vercel-style blank env values are provided', async () => {
    // Reproduces the reported production bug: a host can surface an unset
    // VITE_* variable as "" instead of leaving it undefined.
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_ENABLE_MOCKS', '');
    const environment = await loadEnvironment();
    expect(environment.apiBaseUrl).toBe('/api');
    expect(typeof environment.enableMocks).toBe('boolean');
  });

  it('respects an explicit real-backend override', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    vi.stubEnv('VITE_ENABLE_MOCKS', 'false');
    const environment = await loadEnvironment();
    expect(environment.apiBaseUrl).toBe('https://api.example.com');
    expect(environment.enableMocks).toBe(false);
  });

  it('production buildda localhost API override o‘rniga xavfsiz /api ishlatadi', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
    const environment = await loadEnvironment();
    expect(environment.apiBaseUrl).toBe('/api');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('development rejimida localhost API override ishlashini saqlaydi', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
    const environment = await loadEnvironment();
    expect(environment.apiBaseUrl).toBe('http://localhost:3000/api');
  });

  it('respects an explicit demo override on a production-style build', async () => {
    vi.stubEnv('VITE_ENABLE_MOCKS', 'true');
    const environment = await loadEnvironment();
    expect(environment.enableMocks).toBe(true);
  });

  it('logs a diagnostic and falls back to safe defaults instead of throwing on a malformed value', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('VITE_ENABLE_MOCKS', 'yes-please');
    const environment = await loadEnvironment();
    expect(environment.apiBaseUrl).toBe('/api');
    expect(typeof environment.enableMocks).toBe('boolean');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
