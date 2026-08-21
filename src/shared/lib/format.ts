import type { IsoDate, IsoDateTime, MoneyUzs } from '@/shared/types/domain';

const wholeNumber = /^-?\d+$/;

export function asMoneyUzs(value: string | number | bigint): MoneyUzs {
  const normalized = String(value);
  if (!wholeNumber.test(normalized)) throw new Error(`Noto'g'ri UZS qiymati: ${normalized}`);
  return normalized;
}

export function formatMoney(value: MoneyUzs | null | undefined, compact = false): string {
  if (value === null || value === undefined) return 'Reja mavjud emas';
  const amount = BigInt(value);
  if (compact && (amount >= 1_000_000n || amount <= -1_000_000n)) {
    const absolute = amount < 0n ? -amount : amount;
    const whole = absolute / 1_000_000n;
    const decimal = (absolute % 1_000_000n) / 100_000n;
    const prefix = amount < 0n ? '−' : '';
    return `${prefix}${whole}${decimal > 0n ? `.${decimal}` : ''} mln so'm`;
  }
  return `${new Intl.NumberFormat('uz-UZ').format(amount)} so'm`;
}

export function formatInteger(value: number | bigint): string {
  return new Intl.NumberFormat('uz-UZ').format(value);
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: digits }).format(value)}%`;
}

export function formatDate(value: IsoDate): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Tashkent',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatDateTime(value: IsoDateTime): string {
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  }).format(new Date(value));
}

export function toChartNumber(value: MoneyUzs): number {
  const amount = BigInt(value);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('Chart qiymati JavaScript safe integer chegarasidan tashqarida');
  }
  return Number(amount);
}

export function signedTone(value: MoneyUzs): 'success' | 'danger' | 'neutral' {
  const amount = BigInt(value);
  return amount > 0n ? 'success' : amount < 0n ? 'danger' : 'neutral';
}
