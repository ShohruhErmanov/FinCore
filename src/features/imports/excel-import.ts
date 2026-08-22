import type { ExpenseCategory, MasterItem, UserDirectoryItem } from '@/shared/types/domain';

/** Excel katagidan kelishi mumkin bo‘lgan xom qiymat. */
export type RawCell = string | number | Date | null | undefined;
export type RawRow = RawCell[];

export interface ImportReference {
  branches: Array<{ id: string; name: string }>;
  categories: ExpenseCategory[];
  paymentMethods: MasterItem[];
  departments: MasterItem[];
  users: UserDirectoryItem[];
  fallbackUserId: string;
}

export interface ImportRow {
  sourceSheet: string;
  sourceRow: number;
  transactionDate: string;
  branchId: string;
  branchName: string;
  categoryId: string;
  categoryName: string;
  description: string;
  amountUzs: string;
  paymentMethodId: string;
  departmentId: string;
  responsibleUserId: string;
  comment: string | null;
  /** Sana matn ko‘rinishida bo‘lgan — Excel QUERY’si aynan shularni yo‘qotgan. */
  recoveredTextDate: boolean;
}

export interface ImportIssue {
  /** error — qator import qilinmaydi; info — qator o‘tadi, lekin e’tibor talab qiladi. */
  severity: 'error' | 'info';
  sourceSheet: string;
  sourceRow: number;
  field: string;
  value: string;
  message: string;
}

export interface ImportResult {
  rows: ImportRow[];
  issues: ImportIssue[];
  recoveredCount: number;
}

/** Apostrof variantlari va ortiqcha bo‘shliqlarni bir xillashtiradi. */
export function normalizeName(value: unknown): string {
  return String(value ?? '')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en');
}

/** «Ijara (bino arendasi)» → «ijara» — qavs ichidagi izohni tashlaydi. */
function baseName(value: unknown): string {
  return normalizeName(String(value ?? '').split('(')[0]);
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * Sanani ISO (YYYY-MM-DD) ga keltiradi.
 * Excel seriya raqami, Date obyekti va MATN sanalarni (kk.oo.yyyy) qabul qiladi —
 * matn sanalar Excel QUERY formulasi tashlab ketgan 43 ta yozuvni tiklaydi.
 */
export function parseImportDate(value: RawCell): { date: string | null; fromText: boolean } {
  if (value instanceof Date && !Number.isNaN(value.valueOf()))
    return { date: value.toISOString().slice(0, 10), fromText: false };

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = EXCEL_EPOCH_UTC + Math.round(value) * 86_400_000;
    return { date: new Date(ms).toISOString().slice(0, 10), fromText: false };
  }

  const text = String(value ?? '').trim();
  if (!text) return { date: null, fromText: false };

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, fromText: true };

  // kk.oo.yyyy | kk/oo/yyyy | kk-oo-yyyy
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day
    )
      return { date: parsed.toISOString().slice(0, 10), fromText: true };
  }
  return { date: null, fromText: false };
}

/** «1 234 567,00» / «1,234,567» ko‘rinishlarini butun so‘mga keltiradi. */
export function parseImportAmount(value: RawCell): string | null {
  if (typeof value === 'number')
    return Number.isFinite(value) && value > 0 ? String(Math.round(value)) : null;
  const text = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/,(\d{1,2})$/, '.$1')
    .replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const amount = Math.round(Number(text));
  return amount > 0 ? String(amount) : null;
}

const STOP_WORDS = new Set(['va', 'uchun', 'bilan', 'yoki']);

/** Ma’noli so‘zlar: qavs ichi, ajratgichlar va qisqa yordamchi so‘zlar tashlanadi. */
function tokens(value: unknown): string[] {
  return baseName(value)
    .replace(/[^a-z']+/g, ' ')
    .split(' ')
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/** «energiya» va «energiyasi» — bir xil so‘z deb hisoblanadi. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/**
 * Excel’dagi uzun nomni loyihadagi qisqa nomga moslaydi.
 * «Dasturiy ta'minot / litsenziya (CRM…)» → «Dasturiy ta'minot va litsenziya».
 * Noaniq (bir xil ballga ega) natijalar qaytarilmaydi — pul noto‘g‘ri
 * kategoriyaga tushib qolmasligi uchun.
 */
function findByName<T extends { name: string }>(items: T[], value: RawCell): T | undefined {
  const exact = normalizeName(value);
  if (!exact) return undefined;

  const direct =
    items.find((item) => normalizeName(item.name) === exact) ??
    items.find((item) => baseName(item.name) === baseName(value));
  if (direct) return direct;

  const source = tokens(value);
  if (source.length === 0) return undefined;

  let best: { item: T; score: number } | null = null;
  let tied = false;
  for (const item of items) {
    const target = tokens(item.name);
    if (target.length === 0) continue;
    const shared = source.filter((word) => target.some((other) => sameWord(word, other))).length;
    const score = shared / Math.min(source.length, target.length);
    if (best === null || score > best.score) {
      best = { item, score };
      tied = false;
    } else if (best !== null && score === best.score) {
      tied = true;
    }
  }
  return best && best.score > 0.5 && !tied ? best.item : undefined;
}

/** Kassa varag‘i ustunlari (Sayxun_kassa / Xalqlar_kassa / Jurnal bir xil). */
const COL = {
  date: 1,
  category: 4,
  description: 6,
  amount: 7,
  paymentMethod: 8,
  department: 9,
  responsible: 10,
  branch: 11,
  comment: 12,
} as const;

/**
 * Kassa varag‘ining xom qatorlarini import qilinadigan yozuvlarga aylantiradi.
 * `rows` — 4-qatordan boshlangan ma’lumot qatorlari (sarlavhasiz).
 */
export function normalizeKassaRows(
  sheetName: string,
  rows: RawRow[],
  refs: ImportReference,
  firstRowNumber = 4,
): ImportResult {
  const result: ImportResult = { rows: [], issues: [], recoveredCount: 0 };

  rows.forEach((row, index) => {
    const sourceRow = firstRowNumber + index;
    const add = (field: string, value: RawCell, message: string, severity: 'error' | 'info' = 'error') =>
      result.issues.push({
        severity,
        sourceSheet: sheetName,
        sourceRow,
        field,
        value: String(value ?? ''),
        message,
      });

    const amountUzs = parseImportAmount(row[COL.amount]);
    const hasAnything = row.some((cell) => String(cell ?? '').trim() !== '');
    if (!hasAnything) return;
    if (amountUzs === null) {
      if (String(row[COL.amount] ?? '').trim() !== '')
        add('Summa', row[COL.amount], 'Summa musbat butun son bo‘lishi kerak.');
      return;
    }

    const { date, fromText } = parseImportDate(row[COL.date]);
    if (!date) {
      add('Sana', row[COL.date], 'Sanani aniqlab bo‘lmadi (kk.oo.yyyy formatini kiriting).');
      return;
    }

    const branch = findByName(refs.branches, row[COL.branch]);
    if (!branch) {
      add('Filial', row[COL.branch], 'Filial topilmadi.');
      return;
    }

    const category = findByName(refs.categories, row[COL.category]);
    if (!category) {
      add('Kategoriya', row[COL.category], 'Kategoriya sozlamalarda topilmadi.');
      return;
    }

    const paymentMethod = findByName(refs.paymentMethods, row[COL.paymentMethod]);
    if (!paymentMethod) {
      add('To‘lov usuli', row[COL.paymentMethod], 'To‘lov usuli topilmadi.');
      return;
    }

    const department = findByName(refs.departments, row[COL.department]);
    if (!department) {
      add('Bo‘lim', row[COL.department], 'Bo‘lim topilmadi.');
      return;
    }

    const responsibleText = String(row[COL.responsible] ?? '').trim();
    const responsible = refs.users.find(
      (user) =>
        normalizeName(user.fullName) === normalizeName(responsibleText) ||
        normalizeName(user.fullName).split(' ').includes(normalizeName(responsibleText)),
    );
    if (!responsible && responsibleText)
      add(
        'Mas’ul',
        responsibleText,
        'Xodim topilmadi — yozuv joriy foydalanuvchiga biriktirildi.',
        'info',
      );

    const commentParts = [String(row[COL.comment] ?? '').trim()];
    if (!responsible && responsibleText) commentParts.push(`Mas’ul (Excel): ${responsibleText}`);
    const comment = commentParts.filter(Boolean).join(' · ') || null;

    if (fromText) result.recoveredCount += 1;
    result.rows.push({
      sourceSheet: sheetName,
      sourceRow,
      transactionDate: date,
      branchId: branch.id,
      branchName: branch.name,
      categoryId: category.id,
      categoryName: category.name,
      description: String(row[COL.description] ?? '').trim() || category.name,
      amountUzs,
      paymentMethodId: paymentMethod.id,
      departmentId: department.id,
      responsibleUserId: responsible?.id ?? refs.fallbackUserId,
      comment,
      recoveredTextDate: fromText,
    });
  });

  return result;
}

/** Bir nechta varaq natijasini birlashtiradi. */
export function mergeResults(results: ImportResult[]): ImportResult {
  return {
    rows: results.flatMap((item) => item.rows),
    issues: results.flatMap((item) => item.issues),
    recoveredCount: results.reduce((total, item) => total + item.recoveredCount, 0),
  };
}
