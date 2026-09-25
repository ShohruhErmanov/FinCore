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

/**
 * Pul qiymati har doim to‘liq ko‘rsatiladi: 124 800 000 so‘m.
 * Ikkinchi argument eski chaqiruvlar bilan moslik uchun saqlangan; u endi summani qisqartirmaydi.
 */
export function formatMoney(value: MoneyUzs | null | undefined, _compact = false): string {
  void _compact;
  if (value === null || value === undefined) return 'Reja mavjud emas';
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const sign = negative ? '−' : '';
  return `${sign}${groupDigits(absolute.toString())} so‘m`;
}

/**
 * Ixcham pul formati: "24,9 mln", "1,2 mlrd".
 *
 * Bir ekranda 12 ta ko'rsatkich turganda to'liq raqam ("24 850 000 so'm")
 * o'qishni qiyinlashtiradi. formatMoney o'rnini bosmaydi — u aniqlik kerak
 * bo'lgan joyda qoladi, bu esa faqat qisqa ko'rinish uchun.
 *
 * Butun sonli arifmetika: kasr qismi ham bigint bo'linma orqali olinadi,
 * shuning uchun katta summalarda ham aniqlik yo'qolmaydi.
 */
export function formatMoneyCompact(value: MoneyUzs | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const sign = negative ? '−' : '';

  const unit = (divisor: bigint, suffix: string) => {
    const whole = absolute / divisor;
    // Bitta kasr raqami, pastga yaxlitlangan — ko'rsatkich bor summadan
    // kattaroq ko'rinmasligi uchun.
    const tenth = ((absolute % divisor) * 10n) / divisor;
    const fraction = tenth === 0n ? '' : `,${tenth}`;
    return `${sign}${groupDigits(whole.toString())}${fraction} ${suffix}`;
  };

  if (absolute >= 1_000_000_000n) return unit(1_000_000_000n, 'mlrd');
  if (absolute >= 1_000_000n) return unit(1_000_000n, 'mln');
  if (absolute >= 1_000n) return unit(1_000n, 'ming');
  return `${sign}${groupDigits(absolute.toString())} so‘m`;
}

/**
 * Hisoblangan ulush — NUMERIC(20,2), ikki kasrli string.
 *
 * formatMoney'dan alohida, chunki u BigInt() ishlatadi va kasrli qiymatda
 * xato beradi. Ikkisini aralashtirmaslik ataylab: butun so'm — haqiqatan
 * to'lanadigan pul, kasrli qiymat esa hisoblangan nisbat.
 */
export function formatShare(value: string | null | undefined): string {
  if (value === null || value === undefined || !/^-?\d+(\.\d+)?$/.test(value.trim())) return '—';
  const text = value.trim();
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const cents = `${fraction}00`.slice(0, 2);
  return `${negative ? '−' : ''}${groupDigits(whole)},${cents} so‘m`;
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

/** Oy nomlari — hisob davri tanlagichi va sarlavhalar uchun. */
export const MONTH_NAMES_UZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
] as const;

/** 1–12 → oy nomi; diapazondan tashqarida raqamning o'zi qaytadi. */
export function monthNameUz(month: number): string {
  return MONTH_NAMES_UZ[month - 1] ?? String(month);
}
