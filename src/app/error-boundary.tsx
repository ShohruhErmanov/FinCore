import { Component, type ReactNode } from 'react';

interface ErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    // Xato tafsilotlari va moliyaviy payloadlar browser logiga chiqarilmaydi.
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="grid min-h-screen place-items-center bg-canvas p-6">
          <section className="neu-elevated w-full max-w-lg rounded-2xl border-red-200 p-6">
            <p className="text-sm font-semibold text-red-700">Kutilmagan xato</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">Sahifani ko‘rsatib bo‘lmadi</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Moliyaviy ma’lumotlar o‘zgartirilmadi. Sahifani qayta yuklang; muammo takrorlansa
              tizim administratoriga murojaat qiling.
            </p>
            <button
              type="button"
              className="mt-6 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-[rgb(var(--primary-contrast))] shadow-[var(--neu-shadow-1)] hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
              onClick={() => window.location.reload()}
            >
              Sahifani qayta yuklash
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
