import { useMutation, usePrefetchQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { notificationApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { tashkentBusinessDate } from '@/shared/lib/format';
import type { TelegramSettings } from '@/shared/types/domain';
import { Alert, Breadcrumbs, Button, ErrorState, LoadingState, PageHeader } from '@/shared/ui';
import { NotificationInbox } from './notification-inbox';
import { MonthlyPreviewCard, ReminderPreviewCard } from './notification-previews';
import {
  notificationInboxQuery,
  periodsQuery,
  reminderPreviewQuery,
  telegramLinkQuery,
  telegramSettingsQuery,
  userDirectoryQuery,
} from './notification-queries';
import { TelegramLinkCard } from './telegram-link-card';
import { TelegramRecipientsCard, TelegramScheduleCard } from './telegram-settings-cards';

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TelegramSettings | null>(null);

  const settings = useQuery(telegramSettingsQuery);
  const users = useQuery(userDirectoryQuery);
  // The cards below the settings fetch their own data; start it now rather
  // than after the settings arrive.
  usePrefetchQuery(notificationInboxQuery);
  usePrefetchQuery(telegramLinkQuery);
  usePrefetchQuery(periodsQuery);
  usePrefetchQuery(reminderPreviewQuery(tashkentBusinessDate()));

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      notificationApi.saveSettings({
        enabled: draft?.enabled ?? false,
        dailyReminderEnabled: draft?.dailyReminderEnabled ?? false,
        reminderTimeLocal: draft?.reminderTimeLocal ?? '20:00',
        monthlyReportEnabled: draft?.monthlyReportEnabled ?? false,
        monthlyReportDay: draft?.monthlyReportDay ?? 1,
        recipients: draft?.recipients ?? [],
      }),
    onSuccess: async (saved) => {
      setDraft(saved);
      await queryClient.invalidateQueries({ queryKey: queryKeys.notificationsRoot });
    },
  });

  if (settings.isLoading || users.isLoading)
    return <LoadingState label="Sozlamalar yuklanmoqda…" />;
  if (settings.isError)
    return (
      <ErrorState
        message={getApiErrorMessage(settings.error)}
        onRetry={() => void settings.refetch()}
      />
    );
  if (!draft) return <LoadingState label="Sozlamalar tayyorlanmoqda…" />;

  const updateDraft = (change: (current: TelegramSettings) => TelegramSettings) =>
    setDraft((current) => (current ? change(current) : current));

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Boshqaruv' }, { label: 'Telegram bildirishnoma', current: true }]}
      />
      <PageHeader
        title="Bildirishnomalar"
        description="Ilova ichidagi xabarlar va Telegram sozlamalari."
        actions={
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" /> Saqlash
          </Button>
        }
      />

      <NotificationInbox />

      <Alert title="Yuborish uchun server kerak" tone="warning" className="mb-5">
        Sozlamalar, qabul qiluvchilar va xabar matnlari shu yerda tayyorlanadi va saqlanadi. Lekin
        xabarni <strong>belgilangan vaqtda avtomatik yuborish</strong> uchun doimiy ishlaydigan
        server kerak — brauzer yopiq bo‘lganda sahifa hech narsa yubora olmaydi. Bot tokenini ham
        faqat server saqlashi mumkin.
      </Alert>

      <TelegramLinkCard />
      {save.isError ? (
        <Alert title="Saqlanmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(save.error)}
        </Alert>
      ) : null}
      {save.isSuccess ? (
        <Alert title="Sozlamalar saqlandi" tone="success" className="mb-5">
          Backend ulangach, shu sozlamalar bo‘yicha yuborish boshlanadi.
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <TelegramScheduleCard draft={draft} onUpdate={updateDraft} />
        <TelegramRecipientsCard draft={draft} onUpdate={updateDraft} users={users.data ?? []} />
      </div>

      <ReminderPreviewCard />
      <MonthlyPreviewCard />
    </div>
  );
}
