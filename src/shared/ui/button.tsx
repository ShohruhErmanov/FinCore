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
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-primary text-white hover:bg-blue-700',
        variant === 'secondary' && 'border border-border bg-white text-ink hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-700 hover:bg-slate-100',
        variant === 'danger' && 'bg-danger text-white hover:bg-red-800',
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
