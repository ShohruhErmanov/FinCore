import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDateTime } from '@/common/serialization/financial';
import { APP_ENV, type AppEnv } from '@/config';
import { PrismaService } from '@/database';

/** Safe projection of a link. Deliberately carries no chat id and no numeric Telegram id. */
export interface TelegramLinkStatusDto {
  status: 'linked' | 'unlinked' | 'disabled' | 'pending';
  /** Display-only, straight from Telegram. Never used as identity proof. */
  telegramUsername: string | null;
  displayName: string | null;
  linkedAt: string | null;
  /** Set only while an unused token is still valid. */
  pendingExpiresAt: string | null;
}

export interface TelegramLinkCreatedDto {
  deepLink: string;
  expiresAt: string;
}

/** The subset of a Telegram update this phase understands. Everything else is ignored. */
interface TelegramUpdate {
  message?: {
    text?: unknown;
    chat?: { id?: unknown; type?: unknown };
    from?: { id?: unknown; is_bot?: unknown; username?: unknown; first_name?: unknown; last_name?: unknown };
  };
}

const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?\s+(\S+)$/;

@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  // ------------------------------------------------------------------ link --

  /**
   * Issues a one-time deep link for the caller's own account. The raw token is
   * returned exactly once, here; only its HMAC reaches the database, and
   * neither the token nor the deep link is ever logged.
   */
  async createLink(user: AuthenticatedUser): Promise<TelegramLinkCreatedDto> {
    this.assertEnabled();
    await this.assertLinkableUser(user.id);

    const existing = await this.liveAccount(user.id);
    if (existing)
      throw new ApiException(
        409,
        'TELEGRAM_ALREADY_LINKED',
        'Telegram allaqachon ulangan. Avval uzib, so‘ng qaytadan ulang.',
      );

    // 256 bits of CSPRNG output, base64url so it survives a deep-link query.
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.TELEGRAM_LINK_TOKEN_TTL_MINUTES * 60_000);

    await this.prisma.db.$transaction(async (tx) => {
      // A freshly issued link makes every earlier one dead on arrival.
      await tx.telegram_link_tokens.updateMany({
        where: { user_id: user.id, status: 'pending' },
        data: { status: 'revoked', revoked_at: new Date() },
      });
      await tx.telegram_link_tokens.create({
        data: { user_id: user.id, token_hash: this.hashToken(raw), expires_at: expiresAt },
        select: { id: true },
      });
    });

    // No token, no deep link and no chat id in this line — only the actor.
    this.logger.log(`Telegram ulanish havolasi berildi: user ${user.id}`);

    return {
      deepLink: `https://t.me/${this.env.TELEGRAM_BOT_USERNAME}?start=${raw}`,
      expiresAt: toIsoDateTime(expiresAt)!,
    };
  }

  async status(user: AuthenticatedUser): Promise<TelegramLinkStatusDto> {
    const account = await this.prisma.db.telegram_accounts.findFirst({
      where: { user_id: user.id, status: { not: 'unlinked' } },
      select: {
        status: true,
        telegram_username: true,
        display_name: true,
        linked_at: true,
      },
    });

    if (account)
      return {
        status: account.status === 'disabled' ? 'disabled' : 'linked',
        telegramUsername: account.telegram_username,
        displayName: account.display_name,
        linkedAt: toIsoDateTime(account.linked_at),
        pendingExpiresAt: null,
      };

    const pending = await this.prisma.db.telegram_link_tokens.findFirst({
      where: { user_id: user.id, status: 'pending', expires_at: { gt: new Date() } },
      select: { expires_at: true },
      orderBy: { created_at: 'desc' },
    });

    return {
      status: pending ? 'pending' : 'unlinked',
      telegramUsername: null,
      displayName: null,
      linkedAt: null,
      pendingExpiresAt: pending ? toIsoDateTime(pending.expires_at) : null,
    };
  }

  /**
   * Self-service only — the caller's id comes from the session, never from the
   * request, so there is no cross-user unlink to authorise.
   */
  async unlink(user: AuthenticatedUser): Promise<void> {
    const removed = await this.prisma.db.$transaction(async (tx) => {
      const account = await tx.telegram_accounts.findFirst({
        where: { user_id: user.id, status: { not: 'unlinked' } },
        select: { id: true },
      });

      // Pending links are revoked either way: an unlink must not leave a live
      // deep link that would silently re-bind the account.
      await tx.telegram_link_tokens.updateMany({
        where: { user_id: user.id, status: 'pending' },
        data: { status: 'revoked', revoked_at: new Date() },
      });

      if (!account) return false;
      await tx.telegram_accounts.update({
        where: { id: account.id },
        data: { status: 'unlinked', unlinked_at: new Date() },
      });
      return true;
    });

    if (!removed)
      throw new ApiException(404, 'TELEGRAM_LINK_NOT_FOUND', 'Ulangan Telegram hisobi topilmadi.');

    this.logger.log(`Telegram ulanishi uzildi: user ${user.id}`);
  }

  /** Used by the notification settings read path; returns nothing sensitive. */
  async linkedUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.db.telegram_accounts.findMany({
      where: { user_id: { in: userIds }, status: 'linked' },
      select: { user_id: true },
    });
    return new Set(rows.map((row) => row.user_id));
  }

  // --------------------------------------------------------------- webhook --

  /** Constant-time secret check. A wrong length must not be distinguishable by timing. */
  assertWebhookSecret(provided: string | undefined): void {
    const expected = this.env.TELEGRAM_WEBHOOK_SECRET;
    if (!this.env.TELEGRAM_ENABLED || !expected)
      throw new ApiException(401, 'WEBHOOK_UNAUTHORIZED', 'Webhook qabul qilinmadi.');

    const a = Buffer.from(provided ?? '', 'utf8');
    const b = Buffer.from(expected, 'utf8');
    // timingSafeEqual throws on unequal lengths, so compare a fixed-size digest
    // of each side instead of the raw bytes.
    const digest = (value: Buffer) => createHmac('sha256', b).update(value).digest();
    if (!timingSafeEqual(digest(a), digest(b)))
      throw new ApiException(401, 'WEBHOOK_UNAUTHORIZED', 'Webhook qabul qilinmadi.');
  }

  /**
   * Processes one update. Anything that is not a private-chat `/start <token>`
   * is ignored on purpose: Telegram retries whatever it does not get a 200 for,
   * and an unrelated update is not an error.
   *
   * Nothing about why a binding failed leaves this method — the caller always
   * acknowledges generically so a probe cannot enumerate token state.
   */
  async handleUpdate(update: unknown): Promise<void> {
    const message = (update as TelegramUpdate | null)?.message;
    if (!message || typeof message.text !== 'string') return;

    const match = START_COMMAND.exec(message.text.trim());
    if (!match) return;

    // A group or channel binding would let every member act as the employee.
    if (message.chat?.type !== 'private') {
      this.logger.warn('Telegram ulanish rad etildi: shaxsiy chat emas.');
      return;
    }

    const chatId = this.toBigInt(message.chat?.id);
    const telegramUserId = this.toBigInt(message.from?.id);
    if (chatId === null || telegramUserId === null || message.from?.is_bot === true) return;

    await this.bind({
      tokenHash: this.hashToken(match[1]!),
      chatId,
      telegramUserId,
      username: typeof message.from?.username === 'string' ? message.from.username : null,
      displayName: [message.from?.first_name, message.from?.last_name]
        .filter((part): part is string => typeof part === 'string' && part.length > 0)
        .join(' ') || null,
    });
  }

  // ------------------------------------------------------------- internals --

  /**
   * The whole binding is one serialised unit: the token row is locked FOR
   * UPDATE, so two webhook deliveries racing on the same token queue up and the
   * second one finds it already consumed.
   */
  private async bind(input: {
    tokenHash: string;
    chatId: bigint;
    telegramUserId: bigint;
    username: string | null;
    displayName: string | null;
  }): Promise<void> {
    try {
      await this.prisma.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ id: string; user_id: string; status: string; expires_at: Date }>
        >`
          SELECT id::text AS id, user_id::text AS user_id, status::text AS status, expires_at
          FROM fincore.telegram_link_tokens
          WHERE token_hash = ${input.tokenHash}
          FOR UPDATE
        `;
        const token = locked[0];
        if (!token) throw new ApiException(404, 'TELEGRAM_LINK_INVALID', 'Havola yaroqsiz.');

        // Every attempt is counted, valid or not — a token being hammered is
        // worth seeing in a later phase.
        await tx.telegram_link_tokens.update({
          where: { id: token.id },
          data: { attempt_count: { increment: 1 } },
        });

        if (token.status === 'revoked')
          throw new ApiException(409, 'TELEGRAM_LINK_REVOKED', 'Havola bekor qilingan.');
        if (token.status !== 'pending')
          throw new ApiException(409, 'TELEGRAM_LINK_INVALID', 'Havola allaqachon ishlatilgan.');
        if (token.expires_at.getTime() <= Date.now())
          throw new ApiException(410, 'TELEGRAM_LINK_EXPIRED', 'Havola muddati tugagan.');

        const owner = await tx.users.findUnique({
          where: { id: token.user_id },
          select: { status: true, is_system: true },
        });
        if (!owner || owner.is_system || owner.status !== 'active')
          throw new ApiException(409, 'TELEGRAM_LINK_INVALID', 'Hisob ulanish uchun yaroqsiz.');

        const identityOwner = await tx.telegram_accounts.findFirst({
          where: { telegram_user_id: input.telegramUserId, status: { not: 'unlinked' } },
          select: { user_id: true },
        });
        if (identityOwner && identityOwner.user_id !== token.user_id)
          throw new ApiException(
            409,
            'TELEGRAM_IDENTITY_ALREADY_LINKED',
            'Bu Telegram hisobi boshqa xodimga ulangan.',
          );
        if (!identityOwner) {
          const already = await tx.telegram_accounts.findFirst({
            where: { user_id: token.user_id, status: { not: 'unlinked' } },
            select: { id: true },
          });
          if (already)
            throw new ApiException(409, 'TELEGRAM_ALREADY_LINKED', 'Hisob allaqachon ulangan.');
        }

        const now = new Date();
        if (identityOwner)
          await tx.telegram_accounts.updateMany({
            where: { telegram_user_id: input.telegramUserId, status: { not: 'unlinked' } },
            data: {
              chat_id: input.chatId,
              telegram_username: input.username,
              display_name: input.displayName,
              status: 'linked',
              disabled_at: null,
              verified_at: now,
              linked_at: now,
            },
          });
        else
          await tx.telegram_accounts.create({
            data: {
              user_id: token.user_id,
              telegram_user_id: input.telegramUserId,
              chat_id: input.chatId,
              chat_type: 'private',
              telegram_username: input.username,
              display_name: input.displayName,
              status: 'linked',
              linked_at: now,
              verified_at: now,
            },
            select: { id: true },
          });

        // Consumed inside the same transaction as the binding: one token, one
        // account, and a rollback undoes both together.
        await tx.telegram_link_tokens.update({
          where: { id: token.id },
          data: { status: 'consumed', consumed_at: now },
        });
      });
    } catch (error) {
      // The reason stays server-side; Telegram only ever sees a generic ack.
      const code = error instanceof ApiException ? error.code : 'TELEGRAM_LINK_FAILED';
      this.logger.warn(`Telegram ulanishi amalga oshmadi: ${code}`);
      return;
    }
    this.logger.log('Telegram hisobi muvaffaqiyatli ulandi.');
  }

  private hashToken(raw: string): string {
    return createHmac('sha256', this.env.TELEGRAM_LINK_TOKEN_PEPPER ?? '')
      .update(raw, 'utf8')
      .digest('base64url');
  }

  private assertEnabled(): void {
    if (!this.env.TELEGRAM_ENABLED)
      throw new ApiException(409, 'TELEGRAM_DISABLED', 'Telegram integratsiyasi yoqilmagan.');
  }

  private async assertLinkableUser(userId: string): Promise<void> {
    const row = await this.prisma.db.users.findUnique({
      where: { id: userId },
      select: { status: true, is_system: true },
    });
    // The session guard already refuses an inactive account; this re-check
    // closes the window between sign-in and the click, and blocks the reserved
    // service account outright.
    if (!row || row.is_system || row.status !== 'active')
      throw new ApiException(
        403,
        'TELEGRAM_LINK_FORBIDDEN',
        'Bu hisob Telegramga ulana olmaydi.',
      );
  }

  private async liveAccount(userId: string): Promise<{ id: string } | null> {
    return this.prisma.db.telegram_accounts.findFirst({
      where: { user_id: userId, status: { not: 'unlinked' } },
      select: { id: true },
    });
  }

  private toBigInt(value: unknown): bigint | null {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
    return null;
  }
}
