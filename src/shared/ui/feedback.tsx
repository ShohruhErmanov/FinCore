import {
  AlertCircle,
  CheckCircle2,
  FileQuestion,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldX,
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/shared/lib/cn';

export function Alert({
  title,
  children,
  tone = 'info',
  className,
}: {
  title: string;
  children?: React.ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-card border p-4 text-sm',
        tone === 'info' && 'border-sky-200 bg-sky-50 text-sky-900',
        tone === 'success' && 'border-green-200 bg-green-50 text-green-900',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
        tone === 'danger' && 'border-red-200 bg-red-50 text-red-900',
        className,
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 leading-5 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function LoadingState({ label = 'Ma’lumotlar yuklanmoqda…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-white p-8 text-muted"
      role="status"
    >
      <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function EmptyState({
  title = 'Ma’lumot mavjud emas',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-card border border-dashed border-border bg-white p-8 text-center">
      <FileQuestion className="h-9 w-9 text-slate-400" />
      <h3 className="mt-3 font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-lg text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message = 'Ma’lumotni yuklab bo‘lmadi.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-card border border-red-200 bg-red-50 p-8 text-center">
      <AlertCircle className="h-9 w-9 text-danger" />
      <h3 className="mt-3 font-semibold text-red-900">Server xatosi</h3>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Qayta urinish
        </Button>
      ) : null}
    </div>
  );
}

export function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <ShieldX className="h-14 w-14 text-danger" />
      <h1 className="mt-4 text-2xl font-bold">Ruxsat yo‘q</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Bu bo‘limni ko‘rish uchun hisobingizda yetarli ruxsat mavjud emas. Administratorga murojaat
        qiling.
      </p>
    </div>
  );
}

export function LockedNotice({ children }: { children: React.ReactNode }) {
  return (
    <Alert title="Yopiq davr" tone="warning">
      <span className="inline-flex items-center gap-1">
        <LockKeyhole className="h-4 w-4" />
        {children}
      </span>
    </Alert>
  );
}
