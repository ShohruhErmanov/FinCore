import { z } from 'zod';

function isApiBaseUrl(value: string): boolean {
  if (value.startsWith('/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const environmentSchema = z.object({
  apiBaseUrl: z
    .string()
    .min(1, 'VITE_API_BASE_URL bo‘sh bo‘lishi mumkin emas.')
    .refine(
      isApiBaseUrl,
      'VITE_API_BASE_URL / bilan yoki to‘liq http(s) URL bilan boshlanishi kerak.',
    ),
  enableMocks: z.enum(['true', 'false']),
});

// Demo-safe fallbacks: no real backend is guaranteed to exist for this
// deployment, so an unset/blank VITE_API_BASE_URL falls back to same-origin
// "/api", and VITE_ENABLE_MOCKS defaults to the dev/prod convention below.
// A real backend is opted into explicitly via VITE_ENABLE_MOCKS=false.
const DEFAULT_API_BASE_URL = '/api';
const DEFAULT_ENABLE_MOCKS = import.meta.env.DEV ? 'true' : 'false';

// Some hosts (e.g. a Vercel env var saved with a blank value) surface an
// unset VITE_* variable as "" rather than leaving it undefined. Treat both
// the same as "not provided" before validation, instead of letting an empty
// string reach zod and fail the whole app at startup.
function withDefault(rawValue: string | undefined, fallback: string): string {
  return rawValue && rawValue.length > 0 ? rawValue : fallback;
}

const rawEnvironment = {
  apiBaseUrl: withDefault(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL),
  enableMocks: withDefault(import.meta.env.VITE_ENABLE_MOCKS, DEFAULT_ENABLE_MOCKS),
};

const parsedEnvironment = environmentSchema.safeParse(rawEnvironment);

// A genuinely malformed (non-empty) override - e.g. VITE_API_BASE_URL set to
// something that isn't a path/URL - is a real developer mistake and is
// logged loudly, but it must never white-screen a demo deployment: fall back
// to the safe defaults above and keep the app bootable.
function resolveEnvironment(): { apiBaseUrl: string; enableMocks: string } {
  if (parsedEnvironment.success) return parsedEnvironment.data;
  const details = parsedEnvironment.error.issues.map((issue) => issue.message).join(' ');
  console.error(
    `Frontend environment konfiguratsiyasi noto‘g‘ri, xavfsiz demo default’lar bilan davom etilmoqda: ${details}`,
  );
  return { apiBaseUrl: DEFAULT_API_BASE_URL, enableMocks: DEFAULT_ENABLE_MOCKS };
}

const resolvedEnvironment = resolveEnvironment();

export const environment = Object.freeze({
  apiBaseUrl: resolvedEnvironment.apiBaseUrl.replace(/\/$/, ''),
  enableMocks: resolvedEnvironment.enableMocks === 'true',
});
