import { ArrowDownRight, ArrowUpRight, BadgeAlert, CheckCircle2, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import type { MoneyUzs, PeriodStatus } from '@/shared/types/domain';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-green-50 text-green-800',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-800',
  info: 'bg-sky-50 text-sky-800',
};

export function StatusBadge({
  status,
}: {
  status: PeriodStatus | 'active' | 'inactive' | 'blocked';
}) {
  const meta: Record<string, { label: string; tone: Tone; icon: React.ReactNode }> = {
    closed: { label: 'Yopiq davr', tone: 'neutral', icon: <LockKeyhole /> },
    open: { label: 'Ochiq', tone: 'success', icon: <CheckCircle2 /> },
    active: { label: 'Faol', tone: 'success', icon: <CheckCircle2 /> },
    inactive: { label: 'Nofaol', tone: 'neutral', icon: <ArrowDownRight /> },
    blocked: { label: 'Bloklangan', tone: 'danger', icon: <BadgeAlert /> },
  };
  const item = meta[status] ?? { label: status, tone: 'neutral' as const, icon: <ArrowUpRight /> };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold [&_svg]:h-3.5 [&_svg]:w-3.5',
        toneClass[item.tone],
      )}
    >
      {item.icon}
      {item.label}
    </span>
  );
}

export function MoneyText({
  value,
  compact,
  className,
}: {
  value: MoneyUzs | null;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('tabular-nums', className)}
      title={value === null ? 'Reja mavjud emas' : formatMoney(value)}
    >
      {formatMoney(value, compact)}
    </span>
  );
}

export function PercentText({ value, className }: { value: number | null; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatPercent(value)}</span>;
}

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  helper: string;
  tone?: Tone;
  to?: string;
  demo?: boolean;
}
export function KpiCard({ label, value, helper, tone = 'neutral', to, demo }: KpiCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        {demo ? (
          <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
            Demo ma’lumot
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</div>
      <p className="mt-2 text-xs leading-5 text-muted">{helper}</p>
    </>
  );
  const className = cn(
    'block rounded-card border bg-surface p-5 text-left shadow-card transition',
    tone === 'success' && 'border-green-200',
    tone === 'warning' && 'border-amber-200',
    tone === 'danger' && 'border-red-200',
    tone === 'info' && 'border-sky-200',
    to &&
      'hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline focus-visible:outline-2',
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function VarianceText({ value }: { value: MoneyUzs }) {
  const amount = BigInt(value);
  const positive = amount >= 0n;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold tabular-nums',
        positive ? 'text-success' : 'text-danger',
      )}
    >
      {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      {formatMoney(value)}
    </span>
  );
}
