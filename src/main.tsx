import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppErrorBoundary } from '@/app/error-boundary';
import { AppProviders } from '@/app/providers/app-providers';
import { AppRouter } from '@/app/app-router';
import { startMockApi } from '@/mocks/init';
// Roboto in the four weights the IT Live identity uses, self-hosted so the
// app needs no third-party font request.
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@/app/styles/globals.css';

async function bootstrap() {
  await startMockApi();
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element topilmadi.');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}

void bootstrap();
