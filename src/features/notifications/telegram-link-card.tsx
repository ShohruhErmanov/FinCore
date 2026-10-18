import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Unlink } from 'lucide-react';
import { getApiErrorMessage } from '@/shared/api/client';
import { notificationApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime } from '@/shared/lib/format';
import { Alert, Button, Card, ErrorState, LoadingState } from '@/shared/ui';
import { telegramLinkQuery } from './notification-queries';

/** The caller links their own Telegram through a one-time deep link — never a chat id. */
export function TelegramLinkCard() {
  const queryClient = useQueryClient();
  const link = useQuery(telegramLinkQuery);
  const invalidateLink = () => queryClient.invalidateQueries({ queryKey: queryKeys.telegramLink });
  const createLink = useMutation({
    mutationFn: () => notificationApi.createLink(),
    onSuccess: invalidateLink,
  });
  const unlink = useMutation({
    mutationFn: () => notificationApi.unlink(),
    onSuccess: async () => {
      createLink.reset();
      await invalidateLink();
    },
  });

  return (
    <Card
      title="Mening Telegramim"
      description="Bir martalik havola orqali o‘z hisobingizni ulaysiz. Chat ID kiritilmaydi."
      className="mb-5"
      data-testid="telegram-link-card"
    >
      {link.isLoading ? (
        <LoadingState label="Holat tekshirilmoqda…" />
      ) : link.isError ? (
        <ErrorState message={getApiErrorMessage(link.error)} onRetry={() => void link.refetch()} />
      ) : link.data?.status === 'linked' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-emerald-700">
            Telegram ulangan
            {link.data.telegramUsername ? ` (@${link.data.telegramUsername})` : ''}
          </span>
          <Button
            variant="secondary"
            loading={unlink.isPending}
            onClick={() => {
              // Irreversible for the current binding, so ask first.
              if (window.confirm('Telegram ulanishini uzasizmi?')) unlink.mutate();
            }}
          >
            <Unlink className="h-4 w-4" /> Uzish
          </Button>
        </div>
      ) : link.data?.status === 'disabled' ? (
        <Alert title="Ulanish o‘chirilgan" tone="warning">
          Hisobingiz ulangan, lekin yuborish to‘xtatilgan. Qaytadan ulash uchun avval uzing.
        </Alert>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {link.data?.status === 'pending'
              ? 'Havola yuborilgan — Telegramda botga /start yozing.'
              : 'Telegram hali ulanmagan.'}
          </p>
          <Button loading={createLink.isPending} onClick={() => createLink.mutate()}>
            <Link2 className="h-4 w-4" />
            {link.data?.status === 'pending' ? 'Yangi havola olish' : 'Telegramni ulash'}
          </Button>
          {createLink.isError ? (
            <Alert title="Havola olinmadi" tone="danger">
              {getApiErrorMessage(createLink.error)}
            </Alert>
          ) : null}
          {createLink.data ? (
            <Alert title="Havola tayyor" tone="info">
              <a
                className="font-semibold underline"
                href={createLink.data.deepLink}
                target="_blank"
                rel="noreferrer"
              >
                Telegramda ochish
              </a>
              <span className="ml-2 text-xs">
                Amal qiladi: {formatDateTime(createLink.data.expiresAt)}
              </span>
            </Alert>
          ) : null}
        </div>
      )}
    </Card>
  );
}
