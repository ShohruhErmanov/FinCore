import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppErrorBoundary } from '@/app/error-boundary';
import { AppProviders } from '@/app/providers/app-providers';
import { AppRouter } from '@/app/app-router';
import { startMockApi } from '@/mocks/init';
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
