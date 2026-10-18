import { BadgeCheck, Ban, CircleSlash, Clock, HandCoins } from 'lucide-react';
import type { PayoutStatus } from '@/shared/types/domain';

const STATUS_META: Record<PayoutStatus, { label: string; className: string; icon: JSX.Element }> = {
  pending: {
    label: 'Kutilmoqda',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: <Clock />,
  },
  approved: {
    label: 'Tasdiqlangan',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    icon: <BadgeCheck />,
  },
  paid: {
    label: 'To‘langan',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: <HandCoins />,
  },
  rejected: {
    label: 'Rad etilgan',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: <Ban />,
  },
  cancelled: {
    label: 'Qaytarib olingan',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: <CircleSlash />,
  },
};

/**
 * A badge of its own rather than widening the shared StatusBadge: payout states
 * are not period states, and collapsing the two vocabularies would make
 * "Ochiq" mean two different things on two different screens.
 */
export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-[var(--neu-shadow-xs)] [&_svg]:h-3.5 [&_svg]:w-3.5 ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}
