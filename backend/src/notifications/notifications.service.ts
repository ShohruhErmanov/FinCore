import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { APP_ENV, type AppEnv } from '@/config';
import { PrismaService } from '@/database';
import { TelegramLinkService } from '@/telegram/telegram-link.service';
import { DashboardService } from '@/reports/dashboard.service';
import {
  currentTashkentBusinessDate,
  DailyRevenuesService,
} from '@/daily-revenues/daily-revenues.service';
import { buildMonthlyReportMessage, buildReminderMessage } from './telegram-message';
import type { TelegramSettingsInputDto } from './dto/notification.dto';

/**
 * Organisation-level notification settings — schedules and which employees are
 * on the list. Deliberately NOT a credential store: since PHASE 38 the bot
 * token, the webhook secret and the link pepper live only in the backend
 * environment, and a chat id is never accepted from a client. Whether an
 * employee is reachable is derived from their own verified Telegram link.
 */
const CONFIG_KEY = 'telegram_notification_settings';

/** Mirrors TelegramSettings (src/shared/types/domain.ts:145). */
export interface TelegramSettingsDto {
  enabled: boolean;
  /** Whether a token is stored. The token itself is never returned. */
  botTokenSet: boolean;
  dailyReminderEnabled: boolean;
  reminderTimeLocal: string;
  monthlyReportEnabled: boolean;
  monthlyReportDay: number;
  recipients: Array<{ userId: string; fullName: string; linked: boolean }>;
}

export interface MonthlyReportPreviewDto {
  periodLabel: string;
  message: string;
  recipients: Array<{ userId: string; fullName: string; linked: boolean }>;
}

/** Mirrors ReminderPreview (src/shared/types/domain.ts:171). */
export interface ReminderPreviewDto {
  businessDate: string;
  branches: Array<{
    branchId: string;
    branchName: string;
    /** null — bu kuni yozuv umuman kiritilmagan (0 so'm bilan bir xil emas). */
    totalUzs: string | null;
    recipients: Array<{ userId: string; fullName: string; linked: boolean }>;
    message: string | null;
  }>;
}

export interface TelegramTestResultDto {
  delivered: boolean;
  /** Never carries the destination chat id — the caller already knows it is their own. */
  note: string;
}

interface StoredConfig {
  enabled: boolean;
  dailyReminderEnabled: boolean;
  reminderTimeLocal: string;
  monthlyReportEnabled: boolean;
  monthlyReportDay: number;
  recipients: Array<{ userId: string; fullName: string; linked: boolean }>;
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
    private readonly links: TelegramLinkService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async getSettings(): Promise<TelegramSettingsDto> {
    const config = await this.readConfig();
    return {
      ...config,
      // Configuration status only — the value itself lives in the environment
      // and this class never reads it.
      botTokenSet: this.env.TELEGRAM_ENABLED && Boolean(this.env.TELEGRAM_BOT_TOKEN),
      recipients: await this.withLinkState(config.recipients),
    };
  }

  async saveSettings(
    actor: AuthenticatedUser,
    input: TelegramSettingsInputDto,
  ): Promise<TelegramSettingsDto> {
    // The credential is no longer something an admin can type in: enabling
    // notifications requires the deployment itself to be configured.
    if (input.enabled && !this.env.TELEGRAM_ENABLED)
      throw new ApiException(
        409,
        'TELEGRAM_DISABLED',
        'Telegram integratsiyasi server sozlamalarida yoqilmagan.',
      );

    const config: StoredConfig = {
      enabled: input.enabled,
      dailyReminderEnabled: input.dailyReminderEnabled,
      reminderTimeLocal: input.reminderTimeLocal,
      monthlyReportEnabled: input.monthlyReportEnabled,
      monthlyReportDay: input.monthlyReportDay,
      // A recipient is a choice of employee, nothing more. Reachability comes
      // from that employee's own verified link, so a chat id supplied here
      // could never grant delivery anywhere.
      recipients: (input.recipients ?? []).map((recipient) => ({
        userId: recipient.userId,
        fullName: recipient.fullName,
        linked: false,
      })),
    };

    // `linked` is derived on every read, so it is not part of what is stored.
    const stored = {
      ...config,
      recipients: config.recipients.map(({ userId, fullName }) => ({ userId, fullName })),
    };

    await this.prisma.db.$executeRaw`
      INSERT INTO fincore.system_settings (key, value, description, updated_by)
      VALUES (
        ${CONFIG_KEY},
        ${JSON.stringify(stored)}::jsonb,
        'Telegram bildirishnoma sozlamalari. Hech qanday sir saqlanmaydi.',
        ${actor.id}::uuid
      )
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
    `;

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

  /**
   * Sends to the caller's OWN verified chat. It deliberately takes no
   * destination: an arbitrary chat id from a form would be an authorisation
   * mechanism, letting an admin push FinCore messages anywhere.
   */
  async sendTest(user: AuthenticatedUser): Promise<TelegramTestResultDto> {
    if (!this.env.TELEGRAM_ENABLED)
      throw new ApiException(409, 'TELEGRAM_DISABLED', 'Telegram integratsiyasi yoqilmagan.');
    const token = this.env.TELEGRAM_BOT_TOKEN;
    if (!token)
      throw new ApiException(409, 'TELEGRAM_DISABLED', 'Bot tokeni server sozlamalarida yo‘q.');

    const account = await this.prisma.db.telegram_accounts.findFirst({
      where: { user_id: user.id, status: 'linked' },
      select: { chat_id: true },
    });
    if (!account)
      throw new ApiException(
        404,
        'TELEGRAM_LINK_NOT_FOUND',
        'Avval o‘z Telegram hisobingizni ulang.',
      );

    // Only ever the caller's own chat, and never echoed back in the response.
    const target = account.chat_id.toString();

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
        return { delivered: true, note: 'DELIVERED' };

      // Telegram's own wording, never the token or the raw URL.
      return {
        delivered: false,
        note: this.redactToken(payload?.description ?? `TELEGRAM_HTTP_${response.status}`, token),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Telegram sinov xabari yuborilmadi: ${this.redactToken(message, token)}`);
      return {
        delivered: false,
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

  /** Marks each configured employee with whether they have verified a link of their own. */
  private async withLinkState(
    recipients: StoredConfig['recipients'],
  ): Promise<StoredConfig['recipients']> {
    const linked = await this.links.linkedUserIds(recipients.map((item) => item.userId));
    return recipients.map((item) => ({ ...item, linked: linked.has(item.userId) }));
  }

  /**
   * A recipient only counts if they have verified their own Telegram link AND
   * may read reports — a monthly financial summary must not reach someone
   * without report access, and never a chat nobody proved they own.
   */
  private async deliverableRecipients(recipients: StoredConfig['recipients']) {
    const withChat = await this.reachable(recipients);
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
    const withChat = await this.reachable(recipients);
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

  /**
   * The only definition of "reachable" in the system: the employee verified a
   * private chat themselves. Nothing an admin types can put someone on this list.
   */
  private async reachable(
    recipients: StoredConfig['recipients'],
  ): Promise<StoredConfig['recipients']> {
    const linked = await this.links.linkedUserIds(recipients.map((item) => item.userId));
    return recipients
      .filter((item) => linked.has(item.userId))
      .map((item) => ({ ...item, linked: true }));
  }

  private redactToken(text: string, token: string): string {
    return text.split(token).join('[redacted]');
  }
}
