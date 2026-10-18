import { useQuery } from '@tanstack/react-query';
import { Bell, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { formatDate, tashkentBusinessDate } from '@/shared/lib/format';
import { Alert, Card, Input, LoadingState, MoneyText, Select } from '@/shared/ui';
import { monthlyPreviewQuery, periodsQuery, reminderPreviewQuery } from './notification-queries';

function MessagePreview({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-card bg-sidebar p-4 text-xs leading-relaxed text-slate-700">
      {text}
    </pre>
  );
}

/** Which branches have not entered the day’s revenue, and the reminder they would get. */
export function ReminderPreviewCard() {
  const [previewDate, setPreviewDate] = useState(() => tashkentBusinessDate());
  const reminder = useQuery(reminderPreviewQuery(previewDate));
  const missing = (reminder.data?.branches ?? []).filter((item) => item.totalUzs === null);

  return (
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
                className="flex flex-wrap items-center justify-between gap-3 neu-raised-sm rounded-lg px-4 py-3"
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
  );
}

/** The month-end message to the director, for the open period unless another is picked. */
export function MonthlyPreviewCard() {
  const periods = useQuery(periodsQuery);
  const [periodId, setPeriodId] = useState('');
  const selectedPeriod = periodId || periods.data?.find((item) => item.status === 'open')?.id || '';
  const monthly = useQuery(monthlyPreviewQuery(selectedPeriod));

  return (
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
  );
}
