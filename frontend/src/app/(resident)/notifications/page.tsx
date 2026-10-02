'use client';

// Resident: every notification, newest first, grouped by day. Open at /notifications.

import { useMemo, useState } from 'react';
import { describe as describeNotification } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/Button';
import {
  ArrowDownLeftIcon,
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DoorExitIcon,
} from '@/components/ui/icons';
import { useNotifications } from '@/hooks/useNotifications';
import { formatRelativeTime } from '@/lib/format';
import type { AppNotification } from '@/types/notification';

type IconType = typeof BellIcon;

const ICONS: Record<string, IconType> = {
  VISITOR_VERIFIED: CheckCircleIcon,
  VISITOR_ENTERED: ArrowDownLeftIcon,
  VISITOR_EXITED: DoorExitIcon,
  INVITATION_CREATED: ClockIcon,
  INVITATION_REVOKED: ClockIcon,
  INVITATION_EXPIRED: ClockIcon,
  INVITATION_EXTENDED: ClockIcon,
  RECURRING_PASS_ENTERED: CalendarIcon,
  RECURRING_PASS_EXITED: CalendarIcon,
  RECURRING_PASS_OVERDUE: CalendarIcon,
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(key: string): string {
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key === todayKey) return 'Today';
  if (key === dayKey(yesterday.toISOString())) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [onlyUnread, setOnlyUnread] = useState(false);

  const groups = useMemo(() => {
    const list = [...notifications]
      .filter((n) => (onlyUnread ? !n.readAt : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const byDay = new Map<string, AppNotification[]>();
    for (const n of list) {
      const key = dayKey(n.createdAt);
      byDay.set(key, [...(byDay.get(key) ?? []), n]);
    }
    return [...byDay.entries()];
  }, [notifications, onlyUnread]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-ink">Notifications</h1>
          <p className="text-[15px] text-ink-400">
            {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up.'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        )}
      </header>

      <div className="flex gap-2">
        {[
          { label: 'All', value: false },
          { label: 'Unread', value: true },
        ].map((f) => (
          <button
            key={f.label}
            type="button"
            aria-pressed={onlyUnread === f.value}
            onClick={() => setOnlyUnread(f.value)}
            className={`rounded-pill border px-4 py-2 text-sm font-medium transition-colors duration-150 ease-premium ${
              onlyUnread === f.value ? 'border-brass/60 bg-brass/10 text-ink' : 'border-ink-100 text-ink-400 hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-card bg-white/[0.04]" />
      ) : groups.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink-100 px-6 py-12 text-center">
          <BellIcon className="mx-auto mb-3 h-6 w-6 text-ink-400" />
          <p className="text-ink-400">{onlyUnread ? 'No unread notifications.' : 'No notifications yet.'}</p>
        </div>
      ) : (
        groups.map(([key, items]) => (
          <section key={key} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-400">{dayLabel(key)}</h2>
            <ul className="glass-card overflow-hidden rounded-card">
              {items.map((n) => {
                const Icon = ICONS[n.type] ?? BellIcon;
                return (
                  <li key={n.id} className="border-b border-ink-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => void markRead(n.id)}
                      className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors duration-150 hover:bg-white/[0.04] ${
                        n.readAt ? '' : 'bg-brass-50/50'
                      }`}
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-brass">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm text-ink ${n.readAt ? '' : 'font-semibold'}`}>
                          {describeNotification(n)}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-400">{formatRelativeTime(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brass" aria-label="Unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
