import { beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { ApiException, type AuthenticatedUser } from '@/common';
import type { AppEnv } from '@/config';
import type { PrismaService } from '@/database';
import { TelegramLinkService } from './telegram-link.service';

const PEPPER = 'p'.repeat(48);
const WEBHOOK_SECRET = 'w'.repeat(48);
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const env = (overrides: Partial<AppEnv> = {}): AppEnv =>
  ({
    TELEGRAM_ENABLED: true,
    TELEGRAM_BOT_TOKEN: '123456:AA-secret',
    TELEGRAM_BOT_USERNAME: 'fincore_bot',
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    TELEGRAM_LINK_TOKEN_PEPPER: PEPPER,
    TELEGRAM_LINK_TOKEN_TTL_MINUTES: 10,
    ...overrides,
  }) as unknown as AppEnv;

const user = (id = USER_ID): AuthenticatedUser =>
  ({ id, status: 'active' }) as unknown as AuthenticatedUser;

const hashOf = (raw: string): string =>
  createHmac('sha256', PEPPER).update(raw, 'utf8').digest('base64url');

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  status: 'pending' | 'consumed' | 'revoked';
  attempt_count: number;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

interface AccountRow {
  id: string;
  user_id: string;
  telegram_user_id: bigint;
  chat_id: bigint;
  status: 'linked' | 'disabled' | 'unlinked';
  telegram_username: string | null;
  display_name: string | null;
  linked_at: Date;
}

interface UserRow {
  id: string;
  status: 'active' | 'inactive' | 'blocked';
  is_system: boolean;
}

/**
 * Small in-memory stand-in for the two operational tables. It is deliberately
 * dumb — the point of these tests is the service's decision-making, not Prisma.
 */
function makeState(seed: { users?: UserRow[]; tokens?: TokenRow[]; accounts?: AccountRow[] } = {}) {
  const state = {
    users: seed.users ?? [{ id: USER_ID, status: 'active' as const, is_system: false }],
    tokens: seed.tokens ?? [],
    accounts: seed.accounts ?? [],
    /** Serialises transactions the way FOR UPDATE serialises the real ones. */
    queue: Promise.resolve() as Promise<unknown>,
  };

  const matches = <T extends Record<string, unknown>>(row: T, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (value !== null && typeof value === 'object' && 'not' in (value as object))
        return row[key] !== (value as { not: unknown }).not;
      return row[key] === value;
    });

  const tx = {
    users: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.users.find((row) => row.id === where.id) ?? null,
    },
    telegram_link_tokens: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const row of state.tokens)
          if (matches(row as unknown as Record<string, unknown>, where)) {
            Object.assign(row, data);
            count += 1;
          }
        return { count };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: TokenRow = {
          id: `tok-${state.tokens.length + 1}`,
          user_id: data.user_id as string,
          token_hash: data.token_hash as string,
          status: 'pending',
          attempt_count: 0,
          expires_at: data.expires_at as Date,
          consumed_at: null,
          revoked_at: null,
          created_at: new Date(),
        };
        state.tokens.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.tokens.find((item) => item.id === where.id)!;
        if (typeof data.attempt_count === 'object' && data.attempt_count !== null)
          row.attempt_count += (data.attempt_count as { increment: number }).increment;
        else Object.assign(row, data);
        return row;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const expiresGt = (where.expires_at as { gt?: Date } | undefined)?.gt;
        const rest = { ...where };
        delete rest.expires_at;
        return (
          state.tokens.find(
            (row) =>
              matches(row as unknown as Record<string, unknown>, rest) &&
              (!expiresGt || row.expires_at.getTime() > expiresGt.getTime()),
          ) ?? null
        );
      },
    },
    telegram_accounts: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.accounts.find((row) => matches(row as unknown as Record<string, unknown>, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const ids = (where.user_id as { in: string[] }).in;
        return state.accounts.filter((row) => ids.includes(row.user_id) && row.status === where.status);
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: AccountRow = {
          id: `acc-${state.accounts.length + 1}`,
          user_id: data.user_id as string,
          telegram_user_id: data.telegram_user_id as bigint,
          chat_id: data.chat_id as bigint,
          status: 'linked',
          telegram_username: (data.telegram_username as string | null) ?? null,
          display_name: (data.display_name as string | null) ?? null,
          linked_at: (data.linked_at as Date) ?? new Date(),
        };
        state.accounts.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.accounts.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const row of state.accounts)
          if (matches(row as unknown as Record<string, unknown>, where)) {
            Object.assign(row, data);
            count += 1;
          }
        return { count };
      },
    },
    // Only used for the SELECT … FOR UPDATE lock in bind().
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const hash = values[0] as string;
      const row = state.tokens.find((item) => item.token_hash === hash);
      return row
        ? [{ id: row.id, user_id: row.user_id, status: row.status, expires_at: row.expires_at }]
        : [];
    },
  };

  const prisma = {
    db: {
      ...tx,
      // Runs callbacks one after another, so a "concurrent" pair cannot interleave.
      $transaction: async <T>(fn: (client: typeof tx) => Promise<T>): Promise<T> => {
        const run = state.queue.then(() => fn(tx));
        state.queue = run.catch(() => undefined);
        return run;
      },
    },
  } as unknown as PrismaService;

  return { state, prisma };
}

describe('TelegramLinkService — link creation', () => {
  it('issues a deep link and stores only the HMAC of the token', async () => {
    const { state, prisma } = makeState();
    const service = new TelegramLinkService(prisma, env());

    const result = await service.createLink(user());

    const raw = new URL(result.deepLink).searchParams.get('start')!;
    expect(result.deepLink.startsWith('https://t.me/fincore_bot?start=')).toBe(true);
    expect(Buffer.from(raw, 'base64url')).toHaveLength(32); // 256 bits of entropy
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0]!.token_hash).toBe(hashOf(raw));
    expect(state.tokens[0]!.token_hash).not.toBe(raw);
    // Nothing in the row resembles the raw token.
    expect(JSON.stringify(state.tokens[0])).not.toContain(raw);
  });

  it('returns nothing beyond the deep link and its expiry', async () => {
    const { prisma } = makeState();
    const result = await new TelegramLinkService(prisma, env()).createLink(user());
    expect(Object.keys(result).sort()).toEqual(['deepLink', 'expiresAt']);
    expect(JSON.stringify(result)).not.toContain('123456:AA-secret');
    expect(JSON.stringify(result)).not.toContain(WEBHOOK_SECRET);
    expect(JSON.stringify(result)).not.toContain(PEPPER);
  });

  it('revokes the previous pending token so only the newest link works', async () => {
    const { state, prisma } = makeState();
    const service = new TelegramLinkService(prisma, env());

    const first = await service.createLink(user());
    await service.createLink(user());

    const firstRaw = new URL(first.deepLink).searchParams.get('start')!;
    const firstRow = state.tokens.find((row) => row.token_hash === hashOf(firstRaw))!;
    expect(firstRow.status).toBe('revoked');
    expect(state.tokens.filter((row) => row.status === 'pending')).toHaveLength(1);
  });

  it('refuses when Telegram is switched off', async () => {
    const { prisma } = makeState();
    const service = new TelegramLinkService(prisma, env({ TELEGRAM_ENABLED: false }));
    await expect(service.createLink(user())).rejects.toMatchObject({ code: 'TELEGRAM_DISABLED' });
  });

  it('refuses an inactive account', async () => {
    const { prisma } = makeState({ users: [{ id: USER_ID, status: 'inactive', is_system: false }] });
    await expect(new TelegramLinkService(prisma, env()).createLink(user())).rejects.toMatchObject({
      code: 'TELEGRAM_LINK_FORBIDDEN',
    });
  });

  it('refuses the reserved system account', async () => {
    const { prisma } = makeState({ users: [{ id: USER_ID, status: 'active', is_system: true }] });
    await expect(new TelegramLinkService(prisma, env()).createLink(user())).rejects.toMatchObject({
      code: 'TELEGRAM_LINK_FORBIDDEN',
    });
  });

  it('refuses a second binding while one is already live', async () => {
    const { prisma } = makeState({
      accounts: [
        {
          id: 'acc-1',
          user_id: USER_ID,
          telegram_user_id: 42n,
          chat_id: 42n,
          status: 'linked',
          telegram_username: null,
          display_name: null,
          linked_at: new Date(),
        },
      ],
    });
    await expect(new TelegramLinkService(prisma, env()).createLink(user())).rejects.toMatchObject({
      code: 'TELEGRAM_ALREADY_LINKED',
    });
  });
});

describe('TelegramLinkService — webhook secret', () => {
  let service: TelegramLinkService;
  beforeEach(() => {
    service = new TelegramLinkService(makeState().prisma, env());
  });

  it('rejects a missing secret', () => {
    expect(() => service.assertWebhookSecret(undefined)).toThrow(ApiException);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(() => service.assertWebhookSecret('x'.repeat(48))).toThrowError(
      expect.objectContaining({ code: 'WEBHOOK_UNAUTHORIZED' }),
    );
  });

  it('rejects a secret of a different length', () => {
    expect(() => service.assertWebhookSecret('short')).toThrowError(
      expect.objectContaining({ code: 'WEBHOOK_UNAUTHORIZED' }),
    );
  });

  it('accepts the configured secret', () => {
    expect(() => service.assertWebhookSecret(WEBHOOK_SECRET)).not.toThrow();
  });

  it('rejects everything while Telegram is off', () => {
    const off = new TelegramLinkService(makeState().prisma, env({ TELEGRAM_ENABLED: false }));
    expect(() => off.assertWebhookSecret(WEBHOOK_SECRET)).toThrowError(
      expect.objectContaining({ code: 'WEBHOOK_UNAUTHORIZED' }),
    );
  });
});

describe('TelegramLinkService — webhook binding', () => {
  const privateStart = (token: string, chatId = 555, fromId = 777) => ({
    message: {
      text: `/start ${token}`,
      chat: { id: chatId, type: 'private' },
      from: { id: fromId, is_bot: false, username: 'ali', first_name: 'Ali' },
    },
  });

  async function issued(overrides: Partial<TokenRow> = {}) {
    const fixture = makeState();
    const service = new TelegramLinkService(fixture.prisma, env());
    const link = await service.createLink(user());
    const raw = new URL(link.deepLink).searchParams.get('start')!;
    Object.assign(fixture.state.tokens[0]!, overrides);
    return { ...fixture, service, raw };
  }

  it('binds a private chat and consumes the token', async () => {
    const { state, service, raw } = await issued();

    await service.handleUpdate(privateStart(raw));

    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0]).toMatchObject({
      user_id: USER_ID,
      telegram_user_id: 777n,
      chat_id: 555n,
      status: 'linked',
    });
    expect(state.tokens[0]!.status).toBe('consumed');
  });

  it('ignores an update that is not a /start command', async () => {
    const { state, service } = await issued();
    await service.handleUpdate({ message: { text: 'salom', chat: { id: 1, type: 'private' } } });
    await service.handleUpdate({ edited_message: { text: '/start abc' } });
    await service.handleUpdate(null);
    expect(state.accounts).toHaveLength(0);
    expect(state.tokens[0]!.status).toBe('pending');
  });

  it('refuses a group chat', async () => {
    const { state, service, raw } = await issued();
    await service.handleUpdate({
      message: {
        text: `/start ${raw}`,
        chat: { id: -100, type: 'group' },
        from: { id: 777, is_bot: false },
      },
    });
    expect(state.accounts).toHaveLength(0);
    expect(state.tokens[0]!.status).toBe('pending');
  });

  it('refuses a channel post', async () => {
    const { state, service, raw } = await issued();
    await service.handleUpdate({
      message: {
        text: `/start ${raw}`,
        chat: { id: -100, type: 'channel' },
        from: { id: 777, is_bot: false },
      },
    });
    expect(state.accounts).toHaveLength(0);
  });

  it('refuses an expired token', async () => {
    const { state, service, raw } = await issued({ expires_at: new Date(Date.now() - 1_000) });
    await service.handleUpdate(privateStart(raw));
    expect(state.accounts).toHaveLength(0);
    expect(state.tokens[0]!.status).toBe('pending');
  });

  it('refuses a revoked token', async () => {
    const { state, service, raw } = await issued({ status: 'revoked', revoked_at: new Date() });
    await service.handleUpdate(privateStart(raw));
    expect(state.accounts).toHaveLength(0);
  });

  it('refuses a replay of a consumed token', async () => {
    const { state, service, raw } = await issued();
    await service.handleUpdate(privateStart(raw));
    await service.handleUpdate(privateStart(raw, 999, 888));
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0]!.chat_id).toBe(555n);
    expect(state.tokens[0]!.attempt_count).toBe(2);
  });

  it('binds once when two deliveries race on the same token', async () => {
    const { state, service, raw } = await issued();
    await Promise.all([service.handleUpdate(privateStart(raw)), service.handleUpdate(privateStart(raw))]);
    expect(state.accounts).toHaveLength(1);
    expect(state.tokens[0]!.status).toBe('consumed');
  });

  it('refuses an unknown token', async () => {
    const { state, service } = await issued();
    await service.handleUpdate(privateStart('not-a-real-token'));
    expect(state.accounts).toHaveLength(0);
  });

  it('refuses a Telegram identity already bound to someone else', async () => {
    const { state, service, raw } = await issued();
    state.accounts.push({
      id: 'acc-other',
      user_id: OTHER_USER_ID,
      telegram_user_id: 777n,
      chat_id: 12n,
      status: 'linked',
      telegram_username: null,
      display_name: null,
      linked_at: new Date(),
    });

    await service.handleUpdate(privateStart(raw));

    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0]!.user_id).toBe(OTHER_USER_ID);
    expect(state.tokens[0]!.status).toBe('pending');
  });

  it('binds the token owner, never a user id supplied in the update', async () => {
    const { state, service, raw } = await issued();
    await service.handleUpdate({
      ...privateStart(raw),
      // A forged claim in the payload must have no effect whatsoever.
      userId: OTHER_USER_ID,
      message: { ...privateStart(raw).message, userId: OTHER_USER_ID },
    });
    expect(state.accounts[0]!.user_id).toBe(USER_ID);
  });

  it('refuses to bind an account that went inactive after the link was issued', async () => {
    const { state, service, raw } = await issued();
    state.users[0]!.status = 'inactive';
    await service.handleUpdate(privateStart(raw));
    expect(state.accounts).toHaveLength(0);
  });
});

describe('TelegramLinkService — status and unlink', () => {
  const linkedAccount = (): AccountRow => ({
    id: 'acc-1',
    user_id: USER_ID,
    telegram_user_id: 777n,
    chat_id: 555n,
    status: 'linked',
    telegram_username: 'ali',
    display_name: 'Ali',
    linked_at: new Date('2026-08-20T10:00:00.000Z'),
  });

  it('reports a linked account without leaking any identifier', async () => {
    const { prisma } = makeState({ accounts: [linkedAccount()] });
    const status = await new TelegramLinkService(prisma, env()).status(user());

    expect(status.status).toBe('linked');
    expect(status.telegramUsername).toBe('ali');
    const serialised = JSON.stringify(status);
    expect(serialised).not.toContain('555');
    expect(serialised).not.toContain('777');
    expect(Object.keys(status).sort()).toEqual([
      'displayName',
      'linkedAt',
      'pendingExpiresAt',
      'status',
      'telegramUsername',
    ]);
  });

  it('reports pending while an unused token is still valid', async () => {
    const { prisma } = makeState();
    const service = new TelegramLinkService(prisma, env());
    await service.createLink(user());
    const status = await service.status(user());
    expect(status.status).toBe('pending');
    expect(status.pendingExpiresAt).not.toBeNull();
  });

  it('reports unlinked when there is nothing at all', async () => {
    const { prisma } = makeState();
    const status = await new TelegramLinkService(prisma, env()).status(user());
    expect(status.status).toBe('unlinked');
    expect(status.pendingExpiresAt).toBeNull();
  });

  it('unlinks the caller and revokes their pending tokens', async () => {
    const { state, prisma } = makeState({ accounts: [linkedAccount()] });
    const service = new TelegramLinkService(prisma, env());
    state.accounts[0]!.status = 'unlinked';
    await service.createLink(user());
    state.accounts[0]!.status = 'linked';

    await service.unlink(user());

    expect(state.accounts[0]!.status).toBe('unlinked');
    expect(state.tokens[0]!.status).toBe('revoked');
    expect(await service.status(user())).toMatchObject({ status: 'unlinked' });
  });

  it('reports not found when the caller has no link', async () => {
    const { prisma } = makeState();
    await expect(new TelegramLinkService(prisma, env()).unlink(user())).rejects.toMatchObject({
      code: 'TELEGRAM_LINK_NOT_FOUND',
    });
  });

  it('never touches another user — the id comes from the session only', async () => {
    const { state, prisma } = makeState({
      accounts: [{ ...linkedAccount(), id: 'acc-other', user_id: OTHER_USER_ID }],
    });
    await expect(new TelegramLinkService(prisma, env()).unlink(user())).rejects.toMatchObject({
      code: 'TELEGRAM_LINK_NOT_FOUND',
    });
    expect(state.accounts[0]!.status).toBe('linked');
  });
});
