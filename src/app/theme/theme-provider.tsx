import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStorage, writeStorage } from '@/shared/lib/storage';
import { ThemeContext, type AppTheme, type ThemeContextValue } from './theme-context';

const THEME_STORAGE_KEY = 'fincore.theme';

function isTheme(value: string | null): value is AppTheme {
  return value === 'light' || value === 'dark';
}

function readInitialTheme(): AppTheme {
  const savedTheme = readStorage(THEME_STORAGE_KEY);
  return isTheme(savedTheme) ? savedTheme : 'light';
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#101C2F' : '#E4EEF9');
}

function persistTheme(theme: AppTheme) {
  writeStorage(THEME_STORAGE_KEY, theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(() => {
    const initialTheme = readInitialTheme();
    if (typeof document !== 'undefined') applyTheme(initialTheme);
    return initialTheme;
  });

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY && isTheme(event.newValue)) setTheme(event.newValue);
    }

    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((current) => (current === 'light' ? 'dark' : 'light')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
