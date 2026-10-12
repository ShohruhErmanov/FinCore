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
          // brand-600, not the pure #FF2B00: white text needs it for 4.5:1.
          'bg-brand-600 text-white shadow-[0_10px_24px_-12px_rgba(230,38,0,0.75)] ring-1 ring-brand-500/20 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_14px_28px_-12px_rgba(230,38,0,0.85)]',
        variant === 'secondary' &&
          'border border-border/90 bg-white/90 text-ink shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md',
        variant === 'ghost' && 'text-slate-700 hover:bg-slate-100/80',
        variant === 'danger' &&
          // Deeper than primary so a destructive button never reads as the main action.
          'bg-brand-800 text-white shadow-[0_10px_24px_-12px_rgba(138,23,0,0.7)] hover:-translate-y-0.5 hover:bg-brand-900',
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
