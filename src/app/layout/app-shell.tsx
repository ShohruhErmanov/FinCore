import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { notificationApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { readStorage, readStringArray, writeStorage } from '@/shared/lib/storage';
import { AppSidebar } from './app-sidebar';
import { MobileBottomNav } from './mobile-bottom-nav';
import { TopBar } from './top-bar';

export function AppShell() {
  const { user, hasPermission } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => readStorage('fincore.sidebar.collapsed') === 'true',
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const inbox = useQuery({
    queryKey: queryKeys.notificationInbox,
    queryFn: ({ signal }) => notificationApi.inbox(signal),
    enabled: hasPermission('notification.manage'),
    refetchInterval: 15_000,
  });
  const seenStorageKey = `fincore.notifications.seen.${user?.id ?? 'anonymous'}`;
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const cashierEditIds = useMemo(
    () =>
      (inbox.data ?? [])
        .filter(
          (item) =>
            item.eventType === 'expense.updated' || item.eventType === 'daily_revenue.replaced',
        )
        .map((item) => item.id),
    [inbox.data],
  );

  useEffect(() => {
    setSeenIds(new Set(readStringArray(seenStorageKey)));
  }, [seenStorageKey]);

  useEffect(() => {
    if (location.pathname !== routes.notifications || cashierEditIds.length === 0) return;
    setSeenIds((current) => {
      const next = new Set(current);
      cashierEditIds.forEach((id) => next.add(id));
      if (next.size === current.size) return current;
      writeStorage(seenStorageKey, JSON.stringify([...next].slice(-200)));
      return next;
    });
  }, [cashierEditIds, location.pathname, seenStorageKey]);

  const unreadNotificationCount = cashierEditIds.filter((id) => !seenIds.has(id)).length;
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    writeStorage('fincore.sidebar.collapsed', String(collapsed));
  }, [collapsed]);
  return (
    <div className="min-h-screen bg-canvas lg:py-3">
      <div className="fixed inset-y-3 left-3 z-40 hidden overflow-hidden rounded-[24px] border border-border/80 shadow-[var(--neu-shadow-2)] lg:block">
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="neu-scrim absolute inset-0"
            onClick={() => setMobileOpen(false)}
            aria-label="Menyuni yopish"
          />
          <div className="relative h-full w-min overflow-hidden rounded-r-[24px] shadow-[var(--neu-shadow-3)]">
            <AppSidebar collapsed={false} mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          'transition-[margin] duration-200',
          collapsed ? 'lg:ml-[88px]' : 'lg:ml-[264px]',
        )}
      >
        <TopBar
          onOpenMenu={() => setMobileOpen(true)}
          notificationCount={unreadNotificationCount}
        />
        <main
          id="main-content"
          className="premium-enter mx-auto w-full max-w-[1680px] px-4 py-7 pb-24 sm:px-6 lg:pb-10 xl:px-7"
        >
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
