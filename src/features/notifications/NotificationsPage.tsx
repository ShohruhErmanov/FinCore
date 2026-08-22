import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { notificationApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDate } from '@/shared/lib/format';
import type { TelegramRecipient, TelegramSettings } from '@/shared/types/domain';
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
  const [botToken, setBotToken] = useState('');
  const [testChatId, setTestChatId] = useState('');
  const [previewDate, setPreviewDate] = useState(() => new Date().toISOString().slice(0, 10));

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

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      notificationApi.saveSettings({
        enabled: draft?.enabled ?? false,
        ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
        dailyReminderEnabled: draft?.dailyReminderEnabled ?? false,
        reminderTimeLocal: draft?.reminderTimeLocal ?? '20:00',
        monthlyReportEnabled: draft?.monthlyReportEnabled ?? false,
        monthlyReportDay: draft?.monthlyReportDay ?? 1,
        recipients: draft?.recipients ?? [],
      }),
    onSuccess: async (saved) => {
      setDraft(saved);
      setBotToken('');
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const test = useMutation({ mutationFn: () => notificationApi.sendTest(testChatId.trim()) });

  if (settings.isLoading || users.isLoading) return <LoadingState label="Sozlamalar yuklanmoqda…" />;
  if (settings.isError)
    return (
      <ErrorState
        message={getApiErrorMessage(settings.error)}
        onRetry={() => void settings.refetch()}
      />
    );
  if (!draft) return <LoadingState label="Sozlamalar tayyorlanmoqda…" />;

  const chatIdFor = (userId: string) =>
    draft.recipients.find((item) => item.userId === userId)?.chatId ?? '';
  const setChatId = (recipient: Omit<TelegramRecipient, 'chatId'>, chatId: string) =>
    setDraft((current) => {
      if (!current) return current;
      const rest = current.recipients.filter((item) => item.userId !== recipient.userId);
      return {
        ...current,
        recipients: chatId.trim()
          ? [...rest, { ...recipient, chatId: chatId.trim() }]
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

            <FormField
              label="Bot tokeni"
              htmlFor="tg-token"
              hint={
                draft.botTokenSet
                  ? 'Token saqlangan. O‘zgartirish uchun yangisini kiriting.'
                  : '@BotFather bergan tokenni kiriting.'
              }
            >
              <Input
                id="tg-token"
                type="password"
                autoComplete="off"
                placeholder={draft.botTokenSet ? '••••••••••••' : '123456:AA...'}
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
              />
            </FormField>

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
          description="Xodim Telegram’da botga /start yozgach, uning chat ID sini shu yerga kiriting."
        >
          <div className="space-y-3">
            {(users.data ?? [])
              .filter((user) => user.status === 'active')
              .map((user) => (
                <FormField key={user.id} label={user.fullName} htmlFor={`chat-${user.id}`}>
                  <Input
                    id={`chat-${user.id}`}
                    inputMode="numeric"
                    placeholder="Chat ID, masalan 123456789"
                    value={chatIdFor(user.id)}
                    onChange={(event) =>
                      setChatId({ userId: user.id, fullName: user.fullName }, event.target.value)
                    }
                  />
                </FormField>
              ))}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <FormField label="Sinov xabari" htmlFor="tg-test" hint="Chat ID kiriting va yuboring.">
              <div className="flex gap-2">
                <Input
                  id="tg-test"
                  inputMode="numeric"
                  value={testChatId}
                  onChange={(event) => setTestChatId(event.target.value)}
                />
                <Button
                  variant="secondary"
                  loading={test.isPending}
                  onClick={() => test.mutate()}
                >
                  <Send className="h-4 w-4" /> Yuborish
                </Button>
              </div>
            </FormField>
            {test.isError ? (
              <Alert title="Yuborilmadi" tone="danger" className="mt-3">
                {getApiErrorMessage(test.error)}
              </Alert>
            ) : null}
            {test.isSuccess ? (
              <Alert title="Backend hali ulanmagan" tone="info" className="mt-3">
                Chat ID to‘g‘ri ({test.data.chatId}), lekin demo muhitda haqiqiy yuborish yo‘q.
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
