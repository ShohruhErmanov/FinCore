/**
 * Message templates for Telegram. These mirror
 * src/features/notifications/telegram.ts exactly, so the preview an admin sees
 * in the browser is byte-for-byte what the bot would send.
 *
 * The numbers themselves are NOT computed here — they arrive from
 * DashboardService, which reads the sanctioned reporting views.
 */

/** Thin-space grouping, matching the frontend formatter. */
export function telegramMoney(value: string | null | undefined): string {
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

/** Mirrors uzDate() in src/features/notifications/telegram.ts. */
function uzDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

/** Kassirga eslatma — kunlik tushum kiritilmaganda. */
export function buildReminderMessage(input: {
  branchName: string;
  businessDate: string;
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
  revenuePlanUzs: string;
  revenueActualUzs: string;
  revenueCompletionPct: number | null;
  expensePlanUzs: string;
  expenseActualUzs: string;
  expenseCompletionPct: number | null;
  fixedExpenseUzs: string;
  variableExpenseUzs: string;
  branches: Array<{
    name: string;
    revenueActualUzs: string;
    revenueCompletionPct: number | null;
    expenseActualUzs: string;
    expenseCompletionPct: number | null;
  }>;
}

export function buildMonthlyReportMessage(data: MonthlyReportInput): string {
  const fixed = BigInt(data.fixedExpenseUzs);
  const variable = BigInt(data.variableExpenseUzs);
  const totalExpense = fixed + variable;
  const fixedShare = totalExpense === 0n ? null : Number((fixed * 1000n) / totalExpense) / 10;
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
