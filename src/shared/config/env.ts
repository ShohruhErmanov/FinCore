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

const parsedEnvironment = environmentSchema.safeParse({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  enableMocks: import.meta.env.VITE_ENABLE_MOCKS ?? (import.meta.env.DEV ? 'true' : 'false'),
});

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues.map((issue) => issue.message).join(' ');
  throw new Error(`Frontend environment konfiguratsiyasi noto‘g‘ri. ${details}`);
}

export const environment = Object.freeze({
  apiBaseUrl: parsedEnvironment.data.apiBaseUrl.replace(/\/$/, ''),
  enableMocks: parsedEnvironment.data.enableMocks === 'true',
});
