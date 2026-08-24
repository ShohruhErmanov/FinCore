import { Injectable, Logger } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { PrismaService } from '@/database';
import { DashboardService } from '@/reports/dashboard.service';
import {
  currentTashkentBusinessDate,
  DailyRevenuesService,
} from '@/daily-revenues/daily-revenues.service';
import { buildMonthlyReportMessage, buildReminderMessage } from './telegram-message';
import type { TelegramSettingsInputDto } from './dto/notification.dto';

/**
 * Telegram configuration lives in the existing fincore.system_settings table —
 * no new table. The bot token is deliberately held under a SEPARATE key from
 * the rest of the configuration, so the read path that builds the API response
 * physically cannot pick it up.
 */
const CONFIG_KEY = 'telegram_notification_settings';
const TOKEN_KEY = 'telegram_bot_token';

/** Mirrors TelegramSettings (src/shared/types/domain.ts:145). */
export interface TelegramSettingsDto {
  enabled: boolean;
  /** Whether a token is stored. The token itself is never returned. */
  botTokenSet: boolean;
  dailyReminderEnabled: boolean;
  reminderTimeLocal: string;
  monthlyReportEnabled: boolean;
  monthlyReportDay: number;
  recipients: Array<{ userId: string; fullName: string; chatId: string }>;
}

export interface MonthlyReportPreviewDto {
  periodLabel: string;
  message: string;
  recipients: Array<{ userId: string; fullName: string; chatId: string }>;
}

/** Mirrors ReminderPreview (src/shared/types/domain.ts:171). */
export interface ReminderPreviewDto {
  businessDate: string;
  branches: Array<{
    branchId: string;
    branchName: string;
    /** null — bu kuni yozuv umuman kiritilmagan (0 so'm bilan bir xil emas). */
    totalUzs: string | null;
    recipients: Array<{ userId: string; fullName: string; chatId: string }>;
    message: string | null;
  }>;
}

export interface TelegramTestResultDto {
  delivered: boolean;
  chatId: string;
  note: string;
}

interface StoredConfig {
  enabled: boolean;
  dailyReminderEnabled: boolean;
  reminderTimeLocal: string;
  monthlyReportEnabled: boolean;
  monthlyReportDay: number;
  recipients: Array<{ userId: string; fullName: string; chatId: string }>;
}

const DEFAULTS: StoredConfig = {
  enabled: false,
  dailyReminderEnabled: false,
  reminderTimeLocal: '18:30',
  monthlyReportEnabled: false,
  monthlyReportDay: 1,
  recipients: [],
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly dailyRevenues: DailyRevenuesService,
  ) {}

  async getSettings(): Promise<TelegramSettingsDto> {
    const [config, hasToken] = await Promise.all([this.readConfig(), this.hasToken()]);
    return { ...config, botTokenSet: hasToken };
  }

  async saveSettings(
    actor: AuthenticatedUser,
    input: TelegramSettingsInputDto,
  ): Promise<TelegramSettingsDto> {
    const tokenAlreadySet = await this.hasToken();
    // Turning notifications on without a token would leave the scheduler
    // configured but unable to deliver anything.
    if (input.enabled && !input.botToken && !tokenAlreadySet)
      throw new ApiException(422, 'BOT_TOKEN_REQUIRED', 'Bot tokeni kiritilmagan.');

    const config: StoredConfig = {
      enabled: input.enabled,
      dailyReminderEnabled: input.dailyReminderEnabled,
      reminderTimeLocal: input.reminderTimeLocal,
      monthlyReportEnabled: input.monthlyReportEnabled,
      monthlyReportDay: input.monthlyReportDay,
      recipients: (input.recipients ?? []).map((recipient) => ({
        userId: recipient.userId,
        fullName: recipient.fullName,
        chatId: String(recipient.chatId ?? '').trim(),
      })),
    };

    await this.prisma.db.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO fincore.system_settings (key, value, description, updated_by)
        VALUES (
          ${CONFIG_KEY},
          ${JSON.stringify(config)}::jsonb,
          'Telegram bildirishnoma sozlamalari (token alohida kalitda).',
          ${actor.id}::uuid
        )
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
      `;
      // An omitted botToken means "keep the stored one", which is what lets the
      // settings form be saved without re-typing the secret every time.
      if (input.botToken)
        await tx.$executeRaw`
          INSERT INTO fincore.system_settings (key, value, description, updated_by)
          VALUES (
            ${TOKEN_KEY},
            ${JSON.stringify(input.botToken)}::jsonb,
            'Telegram bot tokeni. Hech qachon API javobida qaytarilmaydi.',
            ${actor.id}::uuid
          )
          ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
        `;
    });

    // Deliberately no request body in this log line: it carries the bot token.
    this.logger.log(`Telegram sozlamalari yangilandi: actor ${actor.id}`);
    return this.getSettings();
  }

  async monthlyPreview(
    user: AuthenticatedUser,
    periodId: string,
  ): Promise<MonthlyReportPreviewDto> {
    // Numbers come from the dashboard, which reads the sanctioned views; only
    // the message layout is assembled here.
    const data = await this.dashboard.get(user, periodId, 'all', 'monthly');
    const config = await this.readConfig();

    return {
      periodLabel: data.period.label,
      message: buildMonthlyReportMessage({
        periodLabel: data.period.label,
        revenuePlanUzs: data.revenuePlanUzs,
        revenueActualUzs: data.revenueActualUzs,
        revenueCompletionPct: data.revenueCompletionPct,
        expensePlanUzs: data.expensePlanUzs,
        expenseActualUzs: data.expenseActualUzs,
        expenseCompletionPct: data.expenseCompletionPct,
        fixedExpenseUzs: data.fixedExpenseUzs,
        variableExpenseUzs: data.variableExpenseUzs,
        branches: data.branches.map((branch) => ({
          name: branch.name,
          revenueActualUzs: branch.revenueActualUzs,
          revenueCompletionPct: branch.revenueCompletionPct,
          expenseActualUzs: branch.expenseActualUzs,
          expenseCompletionPct: branch.expenseCompletionPct,
        })),
      }),
      recipients: await this.deliverableRecipients(config.recipients),
    };
  }

  /**
   * Which branches still owe a daily revenue entry for one business date.
   * Totals come from DailyRevenuesService, so the reminder and the ledger can
   * never disagree; a branch with no entry keeps totalUzs null, which is what
   * distinguishes "nothing entered yet" from "entered, and it was zero".
   */
  async reminderPreview(
    user: AuthenticatedUser,
    requestedDate?: string,
  ): Promise<ReminderPreviewDto> {
    const businessDate = requestedDate ?? currentTashkentBusinessDate();
    const [branches, totals, config] = await Promise.all([
      this.prisma.db.branches.findMany({
        where: { is_active: true, id: { in: user.branchScopes } },
        select: { id: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.dailyRevenues.totalsByBranch(businessDate, user.branchScopes),
      this.readConfig(),
    ]);

    const recipientsByBranch = await this.reminderRecipients(config.recipients);

    return {
      businessDate,
      branches: branches.map((branch) => {
        const totalUzs = totals.get(branch.id) ?? null;
        const recipients = recipientsByBranch.get(branch.id) ?? [];
        return {
          branchId: branch.id,
          branchName: branch.name,
          totalUzs,
          recipients,
          // A branch that already reported needs no nudge.
          message:
            totalUzs === null
              ? buildReminderMessage({
                  branchName: branch.name,
                  businessDate,
                  ...(recipients[0] ? { cashierName: recipients[0].fullName } : {}),
                })
              : null,
        };
      }),
    };
  }

  async sendTest(chatId: string): Promise<TelegramTestResultDto> {
    const token = await this.readToken();
    if (!token) throw new ApiException(422, 'BOT_TOKEN_REQUIRED', 'Avval bot tokenini saqlang.');

    const target = chatId.trim();
    if (!/^-?\d{5,}$/.test(target))
      throw new ApiException(422, 'CHAT_ID_INVALID', 'Chat ID raqamlardan iborat bo‘lishi kerak.');

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: target, text: 'FinCore: sinov xabari ✅' }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; description?: string }
        | null;

      if (response.ok && payload?.ok)
        return { delivered: true, chatId: target, note: 'DELIVERED' };

      // Telegram's own wording, never the token or the raw URL.
      return {
        delivered: false,
        chatId: target,
        note: this.redactToken(payload?.description ?? `TELEGRAM_HTTP_${response.status}`, token),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Telegram sinov xabari yuborilmadi: ${this.redactToken(message, token)}`);
      return {
        delivered: false,
        chatId: target,
        note: this.redactToken(message, token),
      };
    }
  }

  // -------------------------------------------------------------------------

  private async readConfig(): Promise<StoredConfig> {
    const row = await this.prisma.db.$queryRaw<Array<{ value: unknown }>>`
      SELECT value FROM fincore.system_settings WHERE key = ${CONFIG_KEY}
    `;
    const stored = row[0]?.value;
    if (!stored || typeof stored !== 'object') return { ...DEFAULTS };
    return { ...DEFAULTS, ...(stored as Partial<StoredConfig>) };
  }

  /** Existence only — the value never leaves this class except to Telegram. */
  private async hasToken(): Promise<boolean> {
    const row = await this.prisma.db.$queryRaw<Array<{ present: boolean }>>`
      SELECT (value IS NOT NULL AND value::text <> '""') AS present
      FROM fincore.system_settings WHERE key = ${TOKEN_KEY}
    `;
    return row[0]?.present === true;
  }

  private async readToken(): Promise<string | null> {
    const row = await this.prisma.db.$queryRaw<Array<{ value: unknown }>>`
      SELECT value FROM fincore.system_settings WHERE key = ${TOKEN_KEY}
    `;
    const value = row[0]?.value;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /**
   * A recipient only counts if they have a chat id AND may read reports —
   * a monthly financial summary must not reach someone without report access.
   */
  private async deliverableRecipients(recipients: StoredConfig['recipients']) {
    const withChat = recipients.filter((recipient) => recipient.chatId.length > 0);
    if (withChat.length === 0) return [];

    const allowed = await this.prisma.db.users.findMany({
      where: {
        id: { in: withChat.map((recipient) => recipient.userId) },
        status: 'active',
        user_roles: {
          some: {
            is_active: true,
            revoked_at: null,
            role: { role_permissions: { some: { permission: { code: 'reports.view' } } } },
          },
        },
      },
      select: { id: true },
    });
    const allowedIds = new Set(allowed.map((user) => user.id));
    return withChat.filter((recipient) => allowedIds.has(recipient.userId));
  }

  /**
   * Groups the configured recipients by the branches they may write to — the
   * same rule the mock applies (writeBranchScopes), which is where a reminder
   * about a missing entry can actually be acted on.
   */
  private async reminderRecipients(
    recipients: StoredConfig['recipients'],
  ): Promise<Map<string, StoredConfig['recipients']>> {
    const withChat = recipients.filter((recipient) => recipient.chatId.length > 0);
    const grouped = new Map<string, StoredConfig['recipients']>();
    if (withChat.length === 0) return grouped;

    const rows = await this.prisma.db.users.findMany({
      where: { id: { in: withChat.map((recipient) => recipient.userId) }, status: 'active' },
      select: {
        id: true,
        user_roles: {
          where: { is_active: true, revoked_at: null },
          select: { branch_id: true },
        },
      },
    });

    const byUser = new Map(rows.map((row) => [row.id, row.user_roles] as const));
    for (const recipient of withChat)
      for (const assignment of byUser.get(recipient.userId) ?? []) {
        // A NULL branch assignment is company-wide READ scope only; write
        // scope — and therefore reminder ownership — is branch-scoped.
        if (!assignment.branch_id) continue;
        const list = grouped.get(assignment.branch_id) ?? [];
        if (!list.some((item) => item.userId === recipient.userId)) list.push(recipient);
        grouped.set(assignment.branch_id, list);
      }
    return grouped;
  }

  private redactToken(text: string, token: string): string {
    return text.split(token).join('[redacted]');
  }
}
