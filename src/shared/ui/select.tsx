import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface SelectOptionMeta {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
}

interface SelectGroupMeta {
  label?: string;
  options: SelectOptionMeta[];
}

type OptionElement = ReactElement<{
  value?: string | number;
  disabled?: boolean;
  children?: ReactNode;
}>;

type GroupElement = ReactElement<{
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
}>;

const fieldClass =
  'neu-inset min-h-11 w-full rounded-xl border border-border/70 px-3 text-sm text-ink transition-[border-color,background-color,box-shadow] duration-200 hover:border-slate-300 focus:border-blue-400 focus:bg-raised focus:ring-4 focus:ring-blue-100/70 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:shadow-none';

function plainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return Children.toArray(node).map(plainText).join('');
}

function optionFromElement(element: OptionElement, groupDisabled = false): SelectOptionMeta {
  return {
    value: String(element.props.value ?? plainText(element.props.children)),
    label: element.props.children,
    text: plainText(element.props.children),
    disabled: groupDisabled || Boolean(element.props.disabled),
  };
}

function collectGroups(children: ReactNode): SelectGroupMeta[] {
  const groups: SelectGroupMeta[] = [];
  let looseOptions: SelectOptionMeta[] = [];

  const flushLooseOptions = () => {
    if (!looseOptions.length) return;
    groups.push({ options: looseOptions });
    looseOptions = [];
  };

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === 'option') {
      looseOptions.push(optionFromElement(child as OptionElement));
      return;
    }
    if (child.type === 'optgroup') {
      flushLooseOptions();
      const group = child as GroupElement;
      const options = Children.toArray(group.props.children)
        .filter(
          (option): option is OptionElement => isValidElement(option) && option.type === 'option',
        )
        .map((option) => optionFromElement(option, Boolean(group.props.disabled)));
      groups.push({
        ...(group.props.label === undefined ? {} : { label: group.props.label }),
        options,
      });
    }
  });
  flushLooseOptions();
  return groups;
}

function moveActive(options: SelectOptionMeta[], current: number, direction: 1 | -1): number {
  if (!options.length) return -1;
  let next = current;
  for (let index = 0; index < options.length; index += 1) {
    next = (next + direction + options.length) % options.length;
    if (!options[next]?.disabled) return next;
  }
  return current;
}

/**
 * A native select remains the form and accessibility source of truth, while
 * pointer/keyboard opening is rendered as a fully themed listbox. This keeps
 * React Hook Form, browser autofill, validation and existing change handlers
 * intact without surrendering the opened menu to the operating system skin.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(
    {
      children,
      className,
      disabled,
      id,
      value,
      defaultValue,
      onChange,
      onBlur,
      onFocus,
      onKeyDown,
      ...props
    },
    forwardedRef,
  ) {
    const generatedId = useId();
    const selectId = id ?? `select-${generatedId.replace(/:/g, '')}`;
    const menuId = `${selectId}-neumorphic-listbox`;
    const selectRef = useRef<HTMLSelectElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const groups = useMemo(() => collectGroups(children), [children]);
    const options = useMemo(() => groups.flatMap((group) => group.options), [groups]);
    const controlledValue = value === undefined ? undefined : String(value);
    const initialValue =
      controlledValue ??
      (defaultValue === undefined ? options[0]?.value : String(defaultValue)) ??
      '';
    const [internalValue, setInternalValue] = useState(initialValue);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(() =>
      Math.max(
        0,
        options.findIndex((option) => option.value === initialValue && !option.disabled),
      ),
    );
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
    const selectedValue = controlledValue ?? internalValue;

    const setCombinedRef = useCallback(
      (node: HTMLSelectElement | null) => {
        selectRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const updatePosition = useCallback(() => {
      const select = selectRef.current;
      if (!select) return;
      const rect = select.getBoundingClientRect();
      const viewportPadding = 12;
      const groupLabels = groups.filter((group) => group.label).length;
      const expectedHeight = Math.min(320, options.length * 42 + groupLabels * 28 + 16);
      const roomBelow = window.innerHeight - rect.bottom - viewportPadding;
      const roomAbove = rect.top - viewportPadding;
      const placeAbove = roomBelow < Math.min(expectedHeight, 220) && roomAbove > roomBelow;
      const availableHeight = Math.max(144, placeAbove ? roomAbove - 8 : roomBelow - 8);
      const width = Math.min(window.innerWidth - viewportPadding * 2, Math.max(rect.width, 188));
      const left = Math.min(
        window.innerWidth - width - viewportPadding,
        Math.max(viewportPadding, rect.left),
      );
      setMenuStyle({
        left,
        width,
        maxHeight: Math.min(320, availableHeight),
        ...(placeAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      });
    }, [groups, options.length]);

    useEffect(() => {
      if (controlledValue !== undefined) setInternalValue(controlledValue);
    }, [controlledValue]);

    useEffect(() => {
      if (!open) return;
      updatePosition();
      const selectedIndex = options.findIndex(
        (option) => option.value === selectedValue && !option.disabled,
      );
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : moveActive(options, -1, 1));

      const handleViewportChange = () => updatePosition();
      const handleOutsidePointer = (event: PointerEvent) => {
        const target = event.target as Node;
        if (selectRef.current?.contains(target) || menuRef.current?.contains(target)) return;
        setOpen(false);
      };
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('scroll', handleViewportChange, true);
      document.addEventListener('pointerdown', handleOutsidePointer, true);
      return () => {
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('scroll', handleViewportChange, true);
        document.removeEventListener('pointerdown', handleOutsidePointer, true);
      };
    }, [open, options, selectedValue, updatePosition]);

    const choose = (nextValue: string) => {
      const option = options.find((item) => item.value === nextValue);
      const select = selectRef.current;
      if (!select || option?.disabled) return;
      setOpen(false);
      select.focus();
      if (select.value === nextValue) return;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value',
      )?.set;
      valueSetter?.call(select, nextValue);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const handleKeyDown: SelectHTMLAttributes<HTMLSelectElement>['onKeyDown'] = (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || disabled) return;
      if (
        !open &&
        (event.key === 'Enter' || event.key === ' ' || (event.altKey && event.key === 'ArrowDown'))
      ) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (!open) return;
      if (event.key === 'Escape' || event.key === 'Tab') {
        setOpen(false);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) =>
          moveActive(options, current, event.key === 'ArrowDown' ? 1 : -1),
        );
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const start = event.key === 'Home' ? -1 : 0;
        setActiveIndex(moveActive(options, start, event.key === 'Home' ? 1 : -1));
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const option = options[activeIndex];
        if (option) choose(option.value);
      }
    };

    let flatIndex = -1;

    return (
      <div className={cn('neu-select-shell relative min-w-0', className)}>
        <select
          {...props}
          ref={setCombinedRef}
          id={selectId}
          disabled={disabled}
          value={value}
          defaultValue={defaultValue}
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className={cn(
            fieldClass,
            'neu-select-native cursor-pointer appearance-none pr-10',
            className,
          )}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            event.preventDefault();
            selectRef.current?.focus();
            setOpen((current) => !current);
          }}
          onClick={(event) => {
            if (!disabled) event.preventDefault();
          }}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(event) => {
            setInternalValue(event.target.value);
            onChange?.(event);
          }}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className={cn('neu-select-chevron', open && 'neu-select-chevron-open')}
        >
          <ChevronDown className="h-4 w-4" />
        </span>

        {open && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={menuRef}
                id={menuId}
                role="listbox"
                aria-label={props['aria-label']}
                className="neu-select-popover fixed overflow-y-auto p-2"
                style={menuStyle}
              >
                {groups.map((group, groupIndex) => (
                  <div
                    key={`${group.label ?? 'options'}-${groupIndex}`}
                    role="group"
                    aria-label={group.label}
                  >
                    {group.label ? (
                      <div className="neu-select-group-label">{group.label}</div>
                    ) : null}
                    <div className="space-y-1">
                      {group.options.map((option) => {
                        flatIndex += 1;
                        const optionIndex = flatIndex;
                        const selected = option.value === selectedValue;
                        const active = optionIndex === activeIndex;
                        return (
                          <button
                            key={`${option.value}-${optionIndex}`}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            disabled={option.disabled}
                            tabIndex={-1}
                            className={cn(
                              'neu-select-option',
                              selected && 'neu-select-option-selected',
                              active && 'neu-select-option-active',
                            )}
                            onPointerDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActiveIndex(optionIndex)}
                            onClick={() => choose(option.value)}
                          >
                            <span className="min-w-0 flex-1 truncate text-left">
                              {option.label}
                            </span>
                            <span
                              aria-hidden="true"
                              className={cn(
                                'neu-select-check',
                                selected && 'neu-select-check-visible',
                              )}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);
