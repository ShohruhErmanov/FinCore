import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { ToastContext, type ToastMessage } from './toast-context';

function useDialogFocus(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!items.length) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, open]);
  return panelRef;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useDialogFocus(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Oynani yopish"
        className="absolute inset-0 bg-slate-950/50"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-card border border-border bg-white shadow-xl focus:outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="aspect-square px-0"
            aria-label="Yopish"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>
        <div className="p-5">{children}</div>
        {footer ? <footer className="border-t border-border p-5">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useDialogFocus(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Panelni yopish"
        className="absolute inset-0 bg-slate-950/50"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl focus:outline-none"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="aspect-square px-0"
            aria-label="Yopish"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Tasdiqlash',
  pending = false,
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        Bu amal serverda qayta tekshiriladi va audit jurnaliga yoziladi.
      </p>
    </Modal>
  );
}

interface ToastItem extends ToastMessage {
  id: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const notify = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = crypto.randomUUID();
    setItems((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 5_000);
  }, []);
  const remove = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[60] grid w-[min(24rem,calc(100vw-2rem))] gap-2"
      >
        {items.map((item) => {
          const Icon =
            item.tone === 'success' ? CheckCircle2 : item.tone === 'danger' ? AlertCircle : Info;
          return (
            <div
              key={item.id}
              role={item.tone === 'danger' ? 'alert' : 'status'}
              className={cn(
                'flex gap-3 rounded-card border bg-white p-4 shadow-xl',
                item.tone === 'success' && 'border-green-300',
                item.tone === 'danger' && 'border-red-300',
                item.tone === 'info' && 'border-sky-300',
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{item.title}</p>
                {item.message ? <p className="mt-0.5 text-sm text-muted">{item.message}</p> : null}
              </div>
              <button type="button" aria-label="Xabarni yopish" onClick={() => remove(item.id)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
