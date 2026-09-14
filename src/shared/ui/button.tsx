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
          'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_10px_24px_-12px_rgba(37,99,235,0.85)] ring-1 ring-blue-500/20 hover:-translate-y-0.5 hover:from-blue-600 hover:to-blue-700 hover:shadow-[0_14px_28px_-12px_rgba(37,99,235,0.9)]',
        variant === 'secondary' &&
          'border border-border/90 bg-white/90 text-ink shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md',
        variant === 'ghost' && 'text-slate-700 hover:bg-slate-100/80',
        variant === 'danger' &&
          'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_10px_24px_-12px_rgba(220,38,38,0.7)] hover:-translate-y-0.5 hover:from-red-600 hover:to-red-700',
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
