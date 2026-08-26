import { telegramMoney } from '@/notifications/telegram-message';
import { isNotificationEventType, type NotificationEventType } from './event-catalog';

/**
 * Turns a catalog event into the text a recipient sees.
 *
 * Deterministic and server-owned: a fixed function per event type, no template
 * string from the database, no user-supplied format. What a renderer may reach
 * for is limited to what the PHASE 39 payload allowlist already permits — so a
 * secret, a chat id, a phone number or a salary figure cannot appear here,
 * because none of them exist in a payload in the first place.
 *
 * Identity and entity UUIDs are deliberately NOT rendered: they mean nothing to
 * a reader and would leak internal keys into a chat transcript.
 */

export class UnsupportedEventTypeError extends Error {
  constructor(readonly eventType: string) {
    super(`Bu hodisa turi uchun matn shabloni yo‘q: ${eventType}`);
    this.name = 'UnsupportedEventTypeError';
  }
}

type Renderer = (payload: Record<string, unknown>) => string;

const text = (value: unknown, fallback = '—'): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
const uzDate = (value: unknown): string => {
  const raw = text(value, '');
  const [year, month, day] = raw.split('-');
  return year && month && day ? `${day}.${month}.${year}` : '—';
};

const RENDERERS: Record<NotificationEventType, Renderer> = {
  'expense.created': (p) =>
    ['🧾 Yangi xarajat', `Sana: ${uzDate(p.transactionDate)}`, `Summa: ${telegramMoney(text(p.amountUzs, '0'))}`].join('\n'),

  'expense.updated': (p) =>
    ['✏️ Xarajat tahrirlandi', `Sana: ${uzDate(p.transactionDate)}`, `Yangi summa: ${telegramMoney(text(p.amountUzs, '0'))}`].join('\n'),

  'daily_revenue.recorded': (p) =>
    [
      '💰 Kunlik tushum kiritildi',
      `Sana: ${uzDate(p.businessDate)}`,
      `Jami: ${telegramMoney(text(p.totalUzs, '0'))}`,
      `Kanallar: ${num(p.channelCount)} ta`,
    ].join('\n'),

  'daily_revenue.replaced': (p) =>
    [
      '♻️ Kunlik tushum qayta kiritildi',
      `Sana: ${uzDate(p.businessDate)}`,
      `Yangi jami: ${telegramMoney(text(p.totalUzs, '0'))}`,
    ].join('\n'),

  'expense_import.completed': (p) =>
    [
      '📥 Xarajat importi yakunlandi',
      `Kiritildi: ${num(p.imported)}`,
      `O‘tkazib yuborildi: ${num(p.skipped)}`,
      `Rad etildi: ${num(p.rejected)}`,
    ].join('\n'),

  'budget_plan.changed': (p) => `📊 Budjet rejasi o‘zgardi (${num(p.lineCount)} ta qator).`,
  'revenue_plan.changed': (p) => `📈 Tushum rejasi o‘zgardi (${num(p.lineCount)} ta qator).`,

  // The user/security family stays deliberately terse: that something changed is
  // notifiable, who and to what is not scattered into a chat transcript.
  'user.created': () => '👤 Yangi xodim hisobi yaratildi.',
  'user.access_changed': () => '🔐 Xodim huquqlari o‘zgartirildi.',
  'user.status_changed': (p) => `🔐 Xodim holati o‘zgardi: ${text(p.status)}.`,
  'user.deleted': () => '🗑 Xodim hisobi o‘chirildi.',
  'user.salary_changed': () => '💼 Xodim oyligi o‘zgartirildi.',
  'role.permissions_changed': (p) =>
    `🔧 Rol huquqlari yangilandi (${num(p.permissionCount)} ta ruxsat).`,

  'daily_revenue.missing': (p) =>
    ['⏰ Kunlik tushum kiritilmagan', `Sana: ${uzDate(p.businessDate)}`, 'Iltimos, tushumni kiriting.'].join('\n'),

  'monthly_report.ready': () => '📅 Oylik hisobot tayyor.',
};

/**
 * @throws UnsupportedEventTypeError when the event type has no renderer — a
 * deterministic failure the worker classifies as permanent rather than retrying.
 */
export function renderNotification(eventType: string, payload: Record<string, unknown>): string {
  if (!isNotificationEventType(eventType)) throw new UnsupportedEventTypeError(eventType);
  const render = RENDERERS[eventType];
  if (!render) throw new UnsupportedEventTypeError(eventType);
  return render(payload ?? {});
}
