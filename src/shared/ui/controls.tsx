import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button, type ButtonProps } from './button';
import { Input } from './form';

export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'children'> & { 'aria-label': string; icon: ReactNode }
>(function IconButton({ icon, className, ...props }, ref) {
  return (
    <Button ref={ref} className={cn('aspect-square px-0', className)} {...props}>
      {icon}
    </Button>
  );
});

export const DatePicker = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function DatePicker(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});

export const DateTimeInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function DateTimeInput(props, ref) {
  return <Input ref={ref} type="datetime-local" {...props} />;
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    label: ReactNode;
    description?: ReactNode;
  }
>(function Checkbox({ label, description, className, id, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  return (
    <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        aria-describedby={descriptionId}
        className={cn(
          'mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-2 focus:ring-blue-200',
          className,
        )}
        {...props}
      />
      <span className="text-sm text-ink">
        <span className="font-medium">{label}</span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs text-muted">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
});

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  legend: string;
  name: string;
  value: T;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-1 text-sm font-semibold text-slate-700">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-blue-50"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="mt-0.5 h-5 w-5 border-border text-primary focus:ring-2 focus:ring-blue-200"
          />
          <span className="text-sm">
            <span className="block font-medium text-ink">{option.label}</span>
            {option.description ? (
              <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
            ) : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function Combobox({
  options,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'list'> & {
  options: Array<{ value: string; label: string }>;
}) {
  const listId = useId();
  return (
    <>
      <Input list={listId} role="combobox" aria-autocomplete="list" {...props} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      aria-label="Filtrlar"
      className={cn('rounded-card border border-border bg-white p-4 shadow-card', className)}
    >
      {children}
    </section>
  );
}

export function Tabs({
  label,
  items,
}: {
  label: string;
  items: Array<{ id: string; label: string; selected: boolean; onSelect: () => void }>;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.selected}
          tabIndex={item.selected ? 0 : -1}
          onClick={item.onSelect}
          className={cn(
            'min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2',
            item.selected
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({
  className,
  label = 'Yuklanmoqda',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'block animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none',
        className,
      )}
    />
  );
}

export function AccessibleChart({
  title,
  description,
  children,
  table,
}: {
  title: string;
  description: string;
  children: ReactNode;
  table: ReactNode;
}) {
  return (
    <figure aria-labelledby={`${title.replace(/\s+/g, '-')}-chart-title`}>
      <figcaption id={`${title.replace(/\s+/g, '-')}-chart-title`} className="sr-only">
        {title}. {description}
      </figcaption>
      <div aria-hidden="true">{children}</div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">
          Diagramma ma’lumotlarini jadvalda ko‘rish
        </summary>
        <div className="mt-3">{table}</div>
      </details>
    </figure>
  );
}
