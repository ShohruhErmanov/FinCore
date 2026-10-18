import { queryOptions } from '@tanstack/react-query';
import { notificationApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';

/**
 * The reads of the notifications page. Each card subscribes to its own; the
 * page prefetches them all on mount, so the cards load side by side instead of
 * one after another.
 */
export const telegramSettingsQuery = queryOptions({
  queryKey: ['notifications', 'telegram'] as const,
  queryFn: ({ signal }) => notificationApi.settings(signal),
});

export const notificationInboxQuery = queryOptions({
  queryKey: queryKeys.notificationInbox,
  queryFn: ({ signal }) => notificationApi.inbox(signal),
  refetchInterval: 15_000,
});

/** Self-service: the caller’s own binding, not an admin setting. */
export const telegramLinkQuery = queryOptions({
  queryKey: queryKeys.telegramLink,
  queryFn: ({ signal }) => notificationApi.linkStatus(signal),
});

export const userDirectoryQuery = queryOptions({
  queryKey: queryKeys.userDirectory,
  queryFn: ({ signal }) => referenceApi.users(signal),
});

export const periodsQuery = queryOptions({
  queryKey: queryKeys.periods,
  queryFn: ({ signal }) => referenceApi.periods(signal),
});

export const reminderPreviewQuery = (businessDate: string) =>
  queryOptions({
    queryKey: queryKeys.notificationReminder(businessDate),
    queryFn: ({ signal }) => notificationApi.reminderPreview(businessDate, signal),
  });

export const monthlyPreviewQuery = (periodId: string) =>
  queryOptions({
    queryKey: queryKeys.notificationMonthly(periodId),
    queryFn: ({ signal }) => notificationApi.monthlyPreview(periodId, signal),
    enabled: Boolean(periodId),
  });
