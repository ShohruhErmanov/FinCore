import { LoaderCircle } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        variant === 'primary' &&
          'bg-primary text-[rgb(var(--primary-contrast))] shadow-[var(--neu-shadow-1)] ring-1 ring-brand-400/35 hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-[var(--neu-shadow-2)] active:translate-y-0 active:shadow-[var(--neu-pressed)]',
        variant === 'secondary' &&
          'neu-raised-sm text-ink hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[var(--neu-shadow-2)] active:shadow-[var(--neu-pressed)]',
        variant === 'ghost' &&
          'text-slate-700 hover:bg-surface hover:shadow-[var(--neu-shadow-xs)] active:shadow-[var(--neu-pressed)]',
        variant === 'danger' &&
          'bg-danger text-[rgb(var(--primary-contrast))] shadow-[var(--neu-shadow-1)] hover:-translate-y-0.5 hover:bg-red-400 hover:shadow-[var(--neu-shadow-2)] active:translate-y-0 active:shadow-[var(--neu-pressed)]',
        size === 'sm' && 'min-h-9 px-3 text-xs',
        size === 'md' && 'px-4 text-sm',
        size === 'lg' && 'px-5 text-base',
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
