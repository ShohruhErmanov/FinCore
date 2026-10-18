import { useMutation } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { notificationApi } from '@/shared/api/contracts';
import type { TelegramSettings, UserDirectoryItem } from '@/shared/types/domain';
import { Alert, Button, Card, FormField, Input, Select } from '@/shared/ui';

type Draft = TelegramSettings;
/** Changes the draft from its latest value, so quick successive clicks never undo each other. */
type UpdateDraft = (change: (current: Draft) => Draft) => void;

/** A checkbox row that presses in while checked. */
function ToggleRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="neu-raised-sm flex min-h-11 items-center gap-3 rounded-lg px-3 transition-[box-shadow,border-color] duration-200 has-[:checked]:border-primary/40 has-[:checked]:shadow-[var(--neu-pressed)]">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}

/** Whether to send at all, and when the daily and monthly messages go out. */
export function TelegramScheduleCard({ draft, onUpdate }: { draft: Draft; onUpdate: UpdateDraft }) {
  return (
    <Card title="Bot va jadval">
      <div className="space-y-4">
        <ToggleRow
          checked={draft.enabled}
          onChange={(enabled) => onUpdate((current) => ({ ...current, enabled }))}
        >
          <span className="text-sm font-semibold text-ink">Bildirishnomalar yoqilgan</span>
        </ToggleRow>

        {/* The token is deployment configuration; it is never typed here. */}
        <div className="neu-inset rounded-lg px-3 py-2 text-sm">
          <span className="font-semibold text-ink">Bot ulanishi: </span>
          {draft.botTokenSet ? (
            <span className="text-emerald-700">server sozlamalarida tayyor</span>
          ) : (
            <span className="text-amber-700">
              server sozlamalarida yoqilmagan (TELEGRAM_ENABLED)
            </span>
          )}
        </div>

        <ToggleRow
          checked={draft.dailyReminderEnabled}
          onChange={(dailyReminderEnabled) =>
            onUpdate((current) => ({ ...current, dailyReminderEnabled }))
          }
        >
          <span className="text-sm font-semibold text-ink">Kunlik eslatma</span>
        </ToggleRow>
        <FormField
          label="Eslatma vaqti"
          htmlFor="tg-time"
          hint="Toshkent vaqti. Shu vaqtgacha tushum kiritilmasa, eslatma yuboriladi."
        >
          <Input
            id="tg-time"
            type="time"
            value={draft.reminderTimeLocal}
            onChange={(event) => {
              const reminderTimeLocal = event.target.value;
              onUpdate((current) => ({ ...current, reminderTimeLocal }));
            }}
          />
        </FormField>

        <ToggleRow
          checked={draft.monthlyReportEnabled}
          onChange={(monthlyReportEnabled) =>
            onUpdate((current) => ({ ...current, monthlyReportEnabled }))
          }
        >
          <span className="text-sm font-semibold text-ink">Oylik hisobot</span>
        </ToggleRow>
        <FormField
          label="Hisobot kuni"
          htmlFor="tg-day"
          hint="Keyingi oyning shu kunida o‘tgan oy yakuni yuboriladi."
        >
          <Select
            id="tg-day"
            value={String(draft.monthlyReportDay)}
            onChange={(event) => {
              const monthlyReportDay = Number(event.target.value);
              onUpdate((current) => ({ ...current, monthlyReportDay }));
            }}
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
  );
}

/**
 * Who receives the messages. A recipient is only a choice of employee: whether
 * a message can actually reach them comes from their own verified link, which
 * the server decides.
 */
export function TelegramRecipientsCard({
  draft,
  onUpdate,
  users,
}: {
  draft: Draft;
  onUpdate: UpdateDraft;
  users: UserDirectoryItem[];
}) {
  const test = useMutation({ mutationFn: () => notificationApi.sendTest() });
  const isChosen = (userId: string) => draft.recipients.some((item) => item.userId === userId);
  const toggleRecipient = (user: { id: string; fullName: string }, chosen: boolean) =>
    onUpdate((current) => {
      const rest = current.recipients.filter((item) => item.userId !== user.id);
      return {
        ...current,
        recipients: chosen
          ? [...rest, { userId: user.id, fullName: user.fullName, linked: false }]
          : rest,
      };
    });

  return (
    <Card
      title="Qabul qiluvchilar"
      description="Kimga yuborilsin. Xabar faqat o‘z Telegramini ulagan xodimga boradi."
    >
      <div className="space-y-2">
        {users
          .filter((user) => user.status === 'active')
          .map((user) => {
            const reachable = draft.recipients.find((item) => item.userId === user.id)?.linked;
            return (
              <ToggleRow
                key={user.id}
                checked={isChosen(user.id)}
                onChange={(chosen) => toggleRecipient(user, chosen)}
              >
                <span className="text-sm font-semibold text-ink">{user.fullName}</span>
                {isChosen(user.id) ? (
                  <span
                    className={`ml-auto text-xs ${reachable ? 'text-emerald-700' : 'text-amber-700'}`}
                  >
                    {reachable ? 'Telegram ulangan' : 'Telegram ulanmagan'}
                  </span>
                ) : null}
              </ToggleRow>
            );
          })}
      </div>
      <div className="mt-5 border-t border-border pt-4">
        {/* No destination field: the test always goes to your own chat. */}
        <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
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
  );
}
