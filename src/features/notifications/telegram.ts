import type { DailyRevenue, IsoDate, MoneyUzs } from '@/shared/types/domain';

/** Telegram xabarida summalar bo‘shliq bilan ajratiladi: 300 000 000 so‘m */
export function telegramMoney(value: MoneyUzs | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const negative = value.startsWith('-');
  const digits = (negative ? value.slice(1) : value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '−' : ''}${digits} so'm`;
}

export function telegramPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${String(Math.round(value * 10) / 10).replace('.', ',')}%`;
}

function uzDate(value: IsoDate): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

export interface BranchRevenueState {
  branchId: string;
  branchName: string;
  totalUzs: MoneyUzs | null;
}

/**
 * Berilgan kunda qaysi filialda kunlik tushum kiritilmaganini aniqlaydi.
 * Kiritilgan, lekin 0 bo‘lgan yozuv «kiritilgan» hisoblanadi.
 */
export function findMissingRevenueBranches(
  branches: Array<{ id: string; name: string; isActive: boolean }>,
  revenues: DailyRevenue[],
  businessDate: IsoDate,
): BranchRevenueState[] {
  return branches
    .filter((branch) => branch.isActive)
    .map((branch) => {
      const entry = revenues.find(
        (row) => row.businessDate === businessDate && row.branchId === branch.id,
      );
      return {
        branchId: branch.id,
        branchName: branch.name,
        totalUzs: entry?.totalUzs ?? null,
      };
    });
}

/** Kassirga eslatma — kunlik tushum kiritilmaganda. */
export function buildReminderMessage(input: {
  branchName: string;
  businessDate: IsoDate;
  cashierName?: string | undefined;
}): string {
  return [
    '⏰ Kunlik tushum kiritilmagan',
    '',
    input.cashierName ? `Kassir: ${input.cashierName}` : null,
    `Filial: ${input.branchName}`,
    `Sana: ${uzDate(input.businessDate)}`,
    '',
    'Iltimos, bugungi tushumni kiriting.',
    'Naqd, karta va bank summalarini alohida yozing.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export interface MonthlyReportInput {
  periodLabel: string;
  revenuePlanUzs: MoneyUzs;
  revenueActualUzs: MoneyUzs;
  revenueCompletionPct: number | null;
  expensePlanUzs: MoneyUzs;
  expenseActualUzs: MoneyUzs;
  expenseCompletionPct: number | null;
  fixedExpenseUzs: MoneyUzs;
  variableExpenseUzs: MoneyUzs;
  branches: Array<{
    name: string;
    revenueActualUzs: MoneyUzs;
    revenueCompletionPct: number | null;
    expenseActualUzs: MoneyUzs;
    expenseCompletionPct: number | null;
  }>;
}

/** Direktorga oy yakuni hisoboti. */
export function buildMonthlyReportMessage(data: MonthlyReportInput): string {
  const fixed = BigInt(data.fixedExpenseUzs);
  const variable = BigInt(data.variableExpenseUzs);
  const totalExpense = fixed + variable;
  const fixedShare =
    totalExpense === 0n ? null : Number((fixed * 1000n) / totalExpense) / 10;
  const net = BigInt(data.revenueActualUzs) - BigInt(data.expenseActualUzs);

  return [
    `📊 ${data.periodLabel} — oylik yakun`,
    '',
    'TUSHUM',
    `Reja:    ${telegramMoney(data.revenuePlanUzs)}`,
    `Amalda:  ${telegramMoney(data.revenueActualUzs)}`,
    `Bajarilish: ${telegramPercent(data.revenueCompletionPct)}`,
    '',
    'XARAJAT',
    `Reja:    ${telegramMoney(data.expensePlanUzs)}`,
    `Amalda:  ${telegramMoney(data.expenseActualUzs)}`,
    `Bajarilish: ${telegramPercent(data.expenseCompletionPct)}`,
    `Doimiy: ${telegramMoney(data.fixedExpenseUzs)} (${telegramPercent(fixedShare)})`,
    `O'zgaruvchan: ${telegramMoney(data.variableExpenseUzs)}`,
    '',
    `NATIJA: ${telegramMoney(net.toString())}`,
    '',
    'FILIALLAR',
    ...data.branches.map(
      (branch) =>
        `• ${branch.name}\n` +
        `   tushum ${telegramMoney(branch.revenueActualUzs)} (${telegramPercent(branch.revenueCompletionPct)})\n` +
        `   xarajat ${telegramMoney(branch.expenseActualUzs)} (${telegramPercent(branch.expenseCompletionPct)})`,
    ),
  ].join('\n');
}
