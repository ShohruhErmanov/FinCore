import type { IsoDate, IsoDateTime, MoneyUzs } from '@/shared/types/domain';

const wholeNumber = /^-?\d+$/;

export function asMoneyUzs(value: string | number | bigint): MoneyUzs {
  const normalized = String(value);
  if (!wholeNumber.test(normalized)) throw new Error(`Noto'g'ri UZS qiymati: ${normalized}`);
  return normalized;
}

/**
 * Uch xonalik guruhlar uzilmas bo‘shliq bilan ajratiladi: 1 732 500.
 * `Intl`ga tayanilmaydi — brauzerlarda `uz-UZ` uchun raqam ma’lumoti yo‘q va
 * u inglizcha «1,732,500» ga qaytadi (Node’dagi ICU’da esa bo‘shliq chiqadi,
 * ya’ni xato faqat foydalanuvchida ko‘rinardi).
 */
function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatMoney(value: MoneyUzs | null | undefined, compact = false): string {
  if (value === null || value === undefined) return 'Reja mavjud emas';
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const sign = negative ? '−' : '';
  if (compact && absolute >= 1_000_000n) {
    const whole = absolute / 1_000_000n;
    const decimal = (absolute % 1_000_000n) / 100_000n;
    return `${sign}${groupDigits(whole.toString())}${decimal > 0n ? `,${decimal}` : ''} mln so'm`;
  }
  return `${sign}${groupDigits(absolute.toString())} so'm`;
}

/** Kasr qismi vergul bilan: 93,75% — o‘zbek/CIS yozuvi. */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const [whole = '0', fraction = ''] = Math.abs(value).toFixed(digits).split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return `${value < 0 ? '−' : ''}${groupDigits(whole)}${trimmed ? `,${trimmed}` : ''}%`;
}

const monthNamesUz = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

/** Tashkent vaqt mintaqasidagi kalendar sana qismlari. */
function tashkentParts(date: Date): { day: number; month: number; year: number } | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const day = pick('day');
  const month = pick('month');
  const year = pick('year');
  if (!day || !month || !year) return null;
  return { day, month, year };
}

/** Backend business-date semantikasi bilan bir xil Asia/Tashkent YYYY-MM-DD sanasi. */
export function tashkentBusinessDate(date = new Date()): IsoDate {
  const parts = tashkentParts(date);
  if (!parts) throw new Error('Asia/Tashkent sanasini aniqlab bo‘lmaydi.');
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Jadval uchun qisqa sana: 20.08.2026 */
export function formatDate(value: IsoDate): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

/** Sarlavha uchun to‘liq sana: 20-avgust 2026 */
export function formatDateLong(value: IsoDate): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return `${day}-${monthNamesUz[month - 1] ?? month} ${year}`;
}

/** Sana va vaqt: 20.08.2026 19:30 */
export function formatDateTime(value: IsoDateTime): string {
  const date = new Date(value);
  const parts = tashkentParts(date);
  if (!parts) return value;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const { day, month, year } = parts;
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year} ${time}`;
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
