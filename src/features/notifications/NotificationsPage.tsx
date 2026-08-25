import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, Link2, Save, Send, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { notificationApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDate, formatDateTime, tashkentBusinessDate } from '@/shared/lib/format';
import type { TelegramSettings } from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  MoneyText,
  PageHeader,
  Select,
} from '@/shared/ui';

const settingsKey = ['notifications', 'telegram'] as const;

function MessagePreview({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-card bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
      {text}
    </pre>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TelegramSettings | null>(null);

  const [previewDate, setPreviewDate] = useState(() => tashkentBusinessDate());

  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => notificationApi.settings(signal),
  });
  const users = useQuery({
    queryKey: queryKeys.userDirectory,
    queryFn: ({ signal }) => referenceApi.users(signal),
  });
  const periods = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
  });
  const [periodId, setPeriodId] = useState('');
  const selectedPeriod =
    periodId || periods.data?.find((item) => item.status === 'open')?.id || '';

  const reminder = useQuery({
    queryKey: ['notifications', 'reminder', previewDate],
    queryFn: ({ signal }) => notificationApi.reminderPreview(previewDate, signal),
  });
  const monthly = useQuery({
    queryKey: ['notifications', 'monthly', selectedPeriod],
    queryFn: ({ signal }) => notificationApi.monthlyPreview(selectedPeriod, signal),
    enabled: Boolean(selectedPeriod),
  });

  // Self-service: this is the caller’s own binding, not an admin setting.
  const link = useQuery({
    queryKey: ['notifications', 'telegram', 'link'],
    queryFn: ({ signal }) => notificationApi.linkStatus(signal),
  });
  const invalidateLink = () =>
    queryClient.invalidateQueries({ queryKey: ['notifications', 'telegram', 'link'] });
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
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const test = useMutation({ mutationFn: () => notificationApi.sendTest() });

  if (settings.isLoading || users.isLoading) return <LoadingState label="Sozlamalar yuklanmoqda…" />;
  if (settings.isError)
    return (
      <ErrorState
        message={getApiErrorMessage(settings.error)}
        onRetry={() => void settings.refetch()}
      />
    );
  if (!draft) return <LoadingState label="Sozlamalar tayyorlanmoqda…" />;

  const isChosen = (userId: string) =>
    draft.recipients.some((item) => item.userId === userId);
  // A recipient is only a choice of employee. Whether a message can actually
  // reach them comes from their own verified link, which the server decides.
  const toggleRecipient = (user: { id: string; fullName: string }, chosen: boolean) =>
    setDraft((current) => {
      if (!current) return current;
      const rest = current.recipients.filter((item) => item.userId !== user.id);
      return {
        ...current,
        recipients: chosen
          ? [...rest, { userId: user.id, fullName: user.fullName, linked: false }]
          : rest,
      };
    });

  const missing = (reminder.data?.branches ?? []).filter((item) => item.totalUzs === null);

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Boshqaruv' }, { label: 'Telegram bildirishnoma', current: true }]}
      />
      <PageHeader
        title="Telegram bildirishnoma"
        description="Kassirga kunlik tushum eslatmasi va direktorga oy yakuni hisoboti."
        actions={
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" /> Saqlash
          </Button>
        }
      />

      <Alert title="Yuborish uchun server kerak" tone="warning" className="mb-5">
        Sozlamalar, qabul qiluvchilar va xabar matnlari shu yerda tayyorlanadi va saqlanadi.
        Lekin xabarni <strong>belgilangan vaqtda avtomatik yuborish</strong> uchun doimiy
        ishlaydigan server kerak — brauzer yopiq bo‘lganda sahifa hech narsa yubora olmaydi.
        Bot tokenini ham faqat server saqlashi mumkin.
      </Alert>

      <Card
        title="Mening Telegramim"
        description="Bir martalik havola orqali o‘z hisobingizni ulaysiz. Chat ID kiritilmaydi."
        className="mb-5"
        data-testid="telegram-link-card"
      >
        {link.isLoading ? (
          <LoadingState label="Holat tekshirilmoqda…" />
        ) : link.isError ? (
          <ErrorState
            message={getApiErrorMessage(link.error)}
            onRetry={() => void link.refetch()}
          />
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
        <Card title="Bot va jadval">
          <div className="space-y-4">
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft({ ...draft, enabled: event.target.checked })
                }
              />
              <span className="text-sm font-semibold text-ink">Bildirishnomalar yoqilgan</span>
            </label>

            {/* The token is deployment configuration; it is never typed here. */}
            <div className="rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-semibold text-ink">Bot ulanishi: </span>
              {draft.botTokenSet ? (
                <span className="text-emerald-700">server sozlamalarida tayyor</span>
              ) : (
                <span className="text-amber-700">
                  server sozlamalarida yoqilmagan (TELEGRAM_ENABLED)
                </span>
              )}
            </div>

            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={draft.dailyReminderEnabled}
                onChange={(event) =>
                  setDraft({ ...draft, dailyReminderEnabled: event.target.checked })
                }
              />
              <span className="text-sm font-semibold text-ink">Kunlik eslatma</span>
            </label>
            <FormField
              label="Eslatma vaqti"
              htmlFor="tg-time"
              hint="Toshkent vaqti. Shu vaqtgacha tushum kiritilmasa, eslatma yuboriladi."
            >
              <Input
                id="tg-time"
                type="time"
                value={draft.reminderTimeLocal}
                onChange={(event) =>
                  setDraft({ ...draft, reminderTimeLocal: event.target.value })
                }
              />
            </FormField>

            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={draft.monthlyReportEnabled}
                onChange={(event) =>
                  setDraft({ ...draft, monthlyReportEnabled: event.target.checked })
                }
              />
              <span className="text-sm font-semibold text-ink">Oylik hisobot</span>
            </label>
            <FormField
              label="Hisobot kuni"
              htmlFor="tg-day"
              hint="Keyingi oyning shu kunida o‘tgan oy yakuni yuboriladi."
            >
              <Select
                id="tg-day"
                value={String(draft.monthlyReportDay)}
                onChange={(event) =>
                  setDraft({ ...draft, monthlyReportDay: Number(event.target.value) })
                }
              >
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}-kun
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </Card>

        <Card
          title="Qabul qiluvchilar"
          description="Kimga yuborilsin. Xabar faqat o‘z Telegramini ulagan xodimga boradi."
        >
          <div className="space-y-2">
            {(users.data ?? [])
              .filter((user) => user.status === 'active')
              .map((user) => {
                const reachable = draft.recipients.find(
                  (item) => item.userId === user.id,
                )?.linked;
                return (
                  <label
                    key={user.id}
                    className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      checked={isChosen(user.id)}
                      onChange={(event) =>
                        toggleRecipient(user, event.target.checked)
                      }
                    />
                    <span className="text-sm font-semibold text-ink">{user.fullName}</span>
                    {isChosen(user.id) ? (
                      <span
                        className={`ml-auto text-xs ${reachable ? 'text-emerald-700' : 'text-amber-700'}`}
                      >
                        {reachable ? 'Telegram ulangan' : 'Telegram ulanmagan'}
                      </span>
                    ) : null}
                  </label>
                );
              })}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            {/* No destination field: the test always goes to your own chat. */}
            <Button
              variant="secondary"
              loading={test.isPending}
              onClick={() => test.mutate()}
            >
              <Send className="h-4 w-4" /> O‘zimga sinov xabari
            </Button>
            {test.isError ? (
              <Alert title="Yuborilmadi" tone="danger" className="mt-3">
                {getApiErrorMessage(test.error)}
              </Alert>
            ) : null}
            {test.isSuccess ? (
              <Alert title="So‘rov qabul qilindi" tone="info" className="mt-3">
                {test.data.note}
              </Alert>
            ) : null}
          </div>
        </Card>
      </div>

      <Card
        title="Kunlik eslatma — bugungi holat"
        description="Qaysi filialda tushum kiritilmagani va yuboriladigan xabar."
        className="mt-5"
        actions={
          <Input
            aria-label="Tekshiriladigan sana"
            type="date"
            className="w-44"
            value={previewDate}
            onChange={(event) => setPreviewDate(event.target.value)}
          />
        }
      >
        {reminder.isLoading ? <LoadingState label="Tekshirilmoqda…" /> : null}
        {reminder.data ? (
          <>
            <div className="space-y-2">
              {reminder.data.branches.map((branch) => (
                <div
                  key={branch.branchId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <span className="font-semibold text-ink">{branch.branchName}</span>
                  {branch.totalUzs === null ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-danger">
                      <Bell className="h-4 w-4" /> Kiritilmagan —{' '}
                      {branch.recipients.length > 0
                        ? `${branch.recipients.map((item) => item.fullName).join(', ')}ga eslatma`
                        : 'chat ID kiritilmagan'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-success">
                      <CheckCircle2 className="h-4 w-4" /> Kiritilgan ·{' '}
                      <MoneyText value={branch.totalUzs} />
                    </span>
                  )}
                </div>
              ))}
            </div>
            {missing.length > 0 && missing[0]?.message ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {formatDate(reminder.data.businessDate)} uchun xabar namunasi
                </p>
                <MessagePreview text={missing[0].message} />
              </div>
            ) : (
              <Alert title="Eslatma kerak emas" tone="success" className="mt-5">
                Bu sanada barcha filiallar tushumni kiritgan.
              </Alert>
            )}
          </>
        ) : null}
      </Card>

      <Card
        title="Oylik hisobot — direktorga"
        description="Oy yakunida yuboriladigan xabar."
        className="mt-5"
        actions={
          <Select
            aria-label="Hisobot davri"
            className="w-44"
            value={selectedPeriod}
            onChange={(event) => setPeriodId(event.target.value)}
          >
            {(periods.data ?? []).map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </Select>
        }
      >
        {monthly.isLoading ? <LoadingState label="Hisobot tayyorlanmoqda…" /> : null}
        {monthly.data ? (
          <>
            <p className="mb-3 text-sm text-muted">
              Qabul qiluvchilar:{' '}
              {monthly.data.recipients.length > 0
                ? monthly.data.recipients.map((item) => item.fullName).join(', ')
                : 'chat ID kiritilmagan'}
            </p>
            <MessagePreview text={monthly.data.message} />
          </>
        ) : null}
      </Card>
    </div>
  );
}
