import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/app/theme';
import { cn } from '@/shared/lib/cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Kunduzgi rejimga o‘tish' : 'Tungi rejimga o‘tish';

  return (
    <button
      type="button"
      className={cn(
        'theme-toggle neu-raised-sm relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:text-primary hover:shadow-[var(--neu-shadow-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:translate-y-0 active:shadow-[var(--neu-pressed)]',
        className,
      )}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      aria-pressed={dark}
    >
      <Sun className="theme-toggle-sun h-5 w-5" aria-hidden="true" />
      <Moon className="theme-toggle-moon absolute h-5 w-5" aria-hidden="true" />
    </button>
  );
}
