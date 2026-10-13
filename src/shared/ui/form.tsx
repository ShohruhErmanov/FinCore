import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';
import { DateInput } from './date-input';

export interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, required, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-700">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const fieldClass =
  'neu-inset min-h-11 w-full rounded-xl border border-border/70 px-3 text-sm text-ink transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:bg-raised focus:ring-4 focus:ring-blue-100/70 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:shadow-none';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type, ...props }, ref) {
    if (type === 'date') {
      return <DateInput ref={ref} className={className} {...props} />;
    }
    return <input ref={ref} type={type} className={cn(fieldClass, className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldClass, 'min-h-24 py-2', className)} {...props} />;
});

export const CurrencyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function CurrencyInput({ className, ...props }, ref) {
    return (
      <div className="relative">
        <input
          ref={ref}
          inputMode="numeric"
          pattern="[0-9]*"
          className={cn(fieldClass, 'pr-14 tabular-nums', className)}
          {...props}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
          so‘m
        </span>
      </div>
    );
  },
);
