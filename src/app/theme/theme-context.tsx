import { createContext, useContext } from 'react';

export type AppTheme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme ThemeProvider ichida ishlatilishi kerak.');
  return context;
}
