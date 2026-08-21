import { environment } from '@/shared/config/env';

export async function startMockApi(): Promise<void> {
  if (!import.meta.env.DEV || !environment.enableMocks) return;
  const { worker } = await import('./browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
}
