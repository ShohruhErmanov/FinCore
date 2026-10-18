import type { TelegramSettings } from '@/shared/types/domain';
import { db } from '../state';

/** Reachability follows the employee's own verified link, never a typed chat id. */
export function isReachable(userId: string): boolean {
  return db.telegramLink.status === 'linked' && userId === db.signedInUser?.id;
}

export function publicTelegramSettings(): TelegramSettings {
  return {
    ...db.telegramState,
    recipients: db.telegramState.recipients.map((item) => ({
      ...item,
      linked: isReachable(item.userId),
    })),
  };
}
