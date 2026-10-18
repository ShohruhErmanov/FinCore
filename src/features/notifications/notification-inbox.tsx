import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { getApiErrorMessage } from '@/shared/api/client';
import { formatDateTime } from '@/shared/lib/format';
import { Card, ErrorState, LoadingState } from '@/shared/ui';
import { notificationInboxQuery } from './notification-queries';

export function NotificationInbox() {
  const inbox = useQuery(notificationInboxQuery);
  return (
    <Card
      title="Kelgan bildirishnomalar"
      description="Kassir tahrirlashda qoldirgan izoh Telegram ulanmagan bo‘lsa ham shu yerda saqlanadi."
      className="mb-5"
    >
      {inbox.isLoading ? <LoadingState label="Bildirishnomalar yuklanmoqda…" /> : null}
      {inbox.isError ? (
        <ErrorState
          message={getApiErrorMessage(inbox.error)}
          onRetry={() => void inbox.refetch()}
        />
      ) : null}
      {inbox.data?.length === 0 ? (
        <p className="text-sm text-muted">Hozircha yangi bildirishnoma yo‘q.</p>
      ) : null}
      {inbox.data && inbox.data.length > 0 ? (
        <div className="space-y-3" data-testid="notification-inbox">
          {inbox.data.map((item) => (
            <article key={item.id} className="neu-raised rounded-card px-4 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <Bell className="h-4 w-4 text-primary" /> Bildirishnoma
                </span>
                <time className="text-xs text-muted" dateTime={item.occurredAt}>
                  {formatDateTime(item.occurredAt)}
                </time>
              </div>
              <p className="whitespace-pre-line text-sm leading-6 text-ink">{item.message}</p>
              {item.telegramStatus === 'permanently_failed' ? (
                <p className="mt-2 text-xs text-amber-700">
                  Ilovada saqlandi · Telegram ulanmagan yoki yetkazib bo‘lmadi
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
