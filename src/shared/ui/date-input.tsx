import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

const MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
] as const;

const WEEKDAYS = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'] as const;

function fromDateValue(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== (month ?? 1) - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateValue(value: string) {
  const date = fromDateValue(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('uz-Latn-UZ', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date: Date, amount: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function clampDate(date: Date, min?: string, max?: string) {
  const value = toDateValue(date);
  if (min && value < min) return fromDateValue(min) ?? date;
  if (max && value > max) return fromDateValue(max) ?? date;
  return date;
}

function monthCanContainDate(month: Date, min?: string, max?: string) {
  const first = toDateValue(new Date(month.getFullYear(), month.getMonth(), 1));
  const last = toDateValue(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  return (!min || last >= min) && (!max || first <= max);
}

interface PopoverPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

export const DateInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function DateInput(
    {
      className,
      value,
      defaultValue,
      disabled,
      readOnly,
      min,
      max,
      placeholder,
      id,
      style,
      onChange,
    onClick,
      onFocus,
      onBlur,
      onKeyDown,
      ...props
    },
    forwardedRef,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const dialogId = `${inputId}-calendar`;
    const inputRef = useRef<HTMLInputElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const controlledValue = typeof value === 'string' ? value : undefined;
    const minimumValue =
      typeof min === 'string' ? min : min === undefined ? undefined : String(min);
    const maximumValue =
      typeof max === 'string' ? max : max === undefined ? undefined : String(max);
    const initialValue = controlledValue ?? (typeof defaultValue === 'string' ? defaultValue : '');
    const [localValue, setLocalValue] = useState(initialValue);
    const selectedValue = controlledValue ?? localValue;
    const [open, setOpen] = useState(false);
    const [cursorDate, setCursorDate] = useState<Date>(() =>
      clampDate(fromDateValue(initialValue) ?? new Date(), minimumValue, maximumValue),
    );
    const [visibleMonth, setVisibleMonth] = useState(
      () => new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1),
    );
    const [position, setPosition] = useState<PopoverPosition | null>(null);

    useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

    useEffect(() => {
      if (controlledValue !== undefined) setLocalValue(controlledValue);
    }, [controlledValue]);

    const updatePosition = () => {
      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const gap = 10;
      const viewportPadding = 12;
      const desiredHeight = 390;
      const roomBelow = window.innerHeight - rect.bottom - viewportPadding;
      const roomAbove = rect.top - viewportPadding;
      const placement = roomBelow >= Math.min(desiredHeight, roomAbove) ? 'bottom' : 'top';
      const maxHeight = Math.max(
        280,
        Math.min(desiredHeight, placement === 'bottom' ? roomBelow : roomAbove),
      );
      const width = Math.min(348, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding,
      );
      const top =
        placement === 'bottom'
          ? rect.bottom + gap
          : Math.max(viewportPadding, rect.top - maxHeight - gap);
      setPosition({ left, top, width, maxHeight, placement });
    };

    const openCalendar = () => {
      if (disabled || readOnly) return;
      const currentValue = inputRef.current?.value || selectedValue;
      const nextCursor = clampDate(
        fromDateValue(currentValue) ?? new Date(),
        minimumValue,
        maximumValue,
      );
      setCursorDate(nextCursor);
      setVisibleMonth(new Date(nextCursor.getFullYear(), nextCursor.getMonth(), 1));
      setOpen(true);
    };

    useLayoutEffect(() => {
      if (!open) return;
      updatePosition();
      const handleViewportChange = () => updatePosition();
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('scroll', handleViewportChange, true);
      return () => {
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('scroll', handleViewportChange, true);
      };
    }, [open]);

    useEffect(() => {
      if (!open) return;
      const handleOutside = (event: PointerEvent) => {
        const target = event.target as Node;
        if (!shellRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
          setOpen(false);
        }
      };
      document.addEventListener('pointerdown', handleOutside);
      return () => document.removeEventListener('pointerdown', handleOutside);
    }, [open]);

    const calendarDays = useMemo(() => {
      const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
      const mondayOffset = (first.getDay() + 6) % 7;
      const gridStart = addDays(first, -mondayOffset);
      return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    }, [visibleMonth]);

    const commitValue = (nextValue: string) => {
      const input = inputRef.current;
      if (!input) return;
      setLocalValue(nextValue);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, nextValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const selectDate = (date: Date) => {
      commitValue(toDateValue(date));
      setCursorDate(date);
      setOpen(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    };

    const moveCursor = (date: Date) => {
      const next = clampDate(date, minimumValue, maximumValue);
      setCursorDate(next);
      setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    };

    const handleCalendarKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      let next: Date | null = null;
      if (event.key === 'ArrowLeft') next = addDays(cursorDate, -1);
      if (event.key === 'ArrowRight') next = addDays(cursorDate, 1);
      if (event.key === 'ArrowUp') next = addDays(cursorDate, -7);
      if (event.key === 'ArrowDown') next = addDays(cursorDate, 7);
      if (event.key === 'PageUp') next = addMonths(cursorDate, -1);
      if (event.key === 'PageDown') next = addMonths(cursorDate, 1);
      if (event.key === 'Home') next = addDays(cursorDate, -((cursorDate.getDay() + 6) % 7));
      if (event.key === 'End') next = addDays(cursorDate, 6 - ((cursorDate.getDay() + 6) % 7));
      if (next) {
        event.preventDefault();
        moveCursor(next);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectDate(cursorDate);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        inputRef.current?.focus();
      }
    };

    const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (open && event.key === 'Tab') {
        setOpen(false);
        return;
      }
      if (!open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
        event.preventDefault();
        openCalendar();
        return;
      }
      if (open) handleCalendarKeyDown(event);
    };

    const handleShellMouseDown = (event: MouseEvent<HTMLDivElement>) => {
      if (disabled || readOnly) return;
      event.preventDefault();
      inputRef.current?.focus();
      openCalendar();
    };

    const todayValue = toDateValue(new Date());
    const canGoPrevious = monthCanContainDate(
      addMonths(visibleMonth, -1),
      minimumValue,
      maximumValue,
    );
    const canGoNext = monthCanContainDate(addMonths(visibleMonth, 1), minimumValue, maximumValue);

    return (
      <>
        <div
          ref={shellRef}
          style={style}
          className={cn(
            'neu-date-shell relative min-h-11 w-full rounded-xl',
            disabled && 'neu-date-disabled',
            open && 'neu-date-shell-open',
            className,
          )}
          onMouseDown={handleShellMouseDown}
        >
          <input
            {...props}
            ref={inputRef}
            id={inputId}
            name={props.name}
            type="date"
            value={controlledValue}
            defaultValue={controlledValue === undefined ? defaultValue : undefined}
            min={min}
            max={max}
            disabled={disabled}
            readOnly={readOnly}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? dialogId : undefined}
            className="neu-date-native absolute inset-0 h-full w-full opacity-0"
            onFocus={onFocus}
            onBlur={onBlur}
            onClick={(event) => {
              onClick?.(event);
              if (!event.defaultPrevented) {
                event.preventDefault();
                openCalendar();
              }
            }}
            onKeyDown={handleInputKeyDown}
            onChange={(event) => {
              setLocalValue(event.currentTarget.value);
              onChange?.(event);
            }}
          />
          <div aria-hidden="true" className="neu-date-display">
            <span className={cn(!selectedValue && 'neu-date-placeholder')}>
              {formatDateValue(selectedValue) || placeholder || 'kk.oo.yyyy'}
            </span>
            <span className="neu-date-icon">
              <CalendarDays size={17} strokeWidth={1.9} />
            </span>
          </div>
        </div>

        {open && position
          ? createPortal(
              <div
                ref={popoverRef}
                id={dialogId}
                role="dialog"
                aria-modal="false"
                aria-label="Sana tanlash"
                className={cn(
                  'neu-date-popover fixed p-3',
                  position.placement === 'top' && 'neu-date-popover-top',
                )}
                style={{
                  left: position.left,
                  top: position.top,
                  width: position.width,
                  maxHeight: position.maxHeight,
                }}
                onKeyDown={handleCalendarKeyDown}
              >
                <div className="neu-date-header">
                  <button
                    type="button"
                    className="neu-date-nav"
                    aria-label="Oldingi oy"
                    disabled={!canGoPrevious}
                    onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="neu-date-month" aria-live="polite">
                    <span>{MONTHS[visibleMonth.getMonth()]}</span>
                    <strong>{visibleMonth.getFullYear()}</strong>
                  </div>
                  <button
                    type="button"
                    className="neu-date-nav"
                    aria-label="Keyingi oy"
                    disabled={!canGoNext}
                    onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="neu-date-weekdays" aria-hidden="true">
                  {WEEKDAYS.map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>

                <div className="neu-date-grid" role="grid" aria-label="Kalendar kunlari">
                  {calendarDays.map((date) => {
                    const dateValue = toDateValue(date);
                    const inMonth = date.getMonth() === visibleMonth.getMonth();
                    const selected = dateValue === selectedValue;
                    const cursor = dateValue === toDateValue(cursorDate);
                    const today = dateValue === todayValue;
                    const outOfRange = Boolean(
                      (minimumValue && dateValue < minimumValue) ||
                        (maximumValue && dateValue > maximumValue),
                    );
                    return (
                      <button
                        key={dateValue}
                        type="button"
                        role="gridcell"
                        aria-selected={selected}
                        aria-current={today ? 'date' : undefined}
                        aria-label={formatDateValue(dateValue)}
                        tabIndex={cursor ? 0 : -1}
                        disabled={outOfRange}
                        className={cn(
                          'neu-date-day',
                          !inMonth && 'neu-date-day-outside',
                          today && 'neu-date-day-today',
                          cursor && 'neu-date-day-cursor',
                          selected && 'neu-date-day-selected',
                        )}
                        onClick={() => selectDate(date)}
                        onMouseEnter={() => setCursorDate(date)}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="neu-date-footer">
                  <button
                    type="button"
                    className="neu-date-footer-action"
                    onClick={() => {
                      commitValue('');
                      setOpen(false);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                  >
                    Tozalash
                  </button>
                  <button
                    type="button"
                    className="neu-date-footer-action neu-date-footer-primary"
                    disabled={Boolean(
                      (minimumValue && todayValue < minimumValue) ||
                        (maximumValue && todayValue > maximumValue),
                    )}
                    onClick={() => selectDate(new Date())}
                  >
                    Bugun
                  </button>
                </div>
              </div>,
              document.body,
            )
          : null}
      </>
    );
  },
);
