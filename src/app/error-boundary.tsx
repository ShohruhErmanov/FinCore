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
        <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
          <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-red-700">Kutilmagan xato</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">Sahifani ko‘rsatib bo‘lmadi</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Moliyaviy ma’lumotlar o‘zgartirilmadi. Sahifani qayta yuklang; muammo takrorlansa
              tizim administratoriga murojaat qiling.
            </p>
            <button
              type="button"
              className="mt-6 min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
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
