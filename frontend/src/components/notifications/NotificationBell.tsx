'use client';

// Notification bell + dropdown (CLAUDE.md §27). Currently only ever has
// content for RESIDENT accounts — the backend only dispatches
// VISITOR_VERIFIED / VISITOR_ENTERED / VISITOR_EXITED / INVITATION_EXPIRED
// today, all resident-facing (see backend README). Mounting this for
// SECURITY_OFFICER/ESTATE_ADMIN is harmless (it'll just always show
// "no notifications yet") but there's no reason to today.

import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { formatRelativeTime } from '@/lib/format';
import { BellIcon } from '@/components/ui/icons';
import type { AppNotification, NotificationType } from '@/types/notification';

const NOTIFICATION_COPY: Record<NotificationType, (payload: Record<string, unknown> | null) => string> = {
  VISITOR_VERIFIED: (p) => `${(p?.visitorName as string) ?? 'Your visitor'} was verified at the gate.`,
  VISITOR_ENTERED: (p) => `${(p?.visitorName as string) ?? 'Your visitor'} has entered the estate.`,
  VISITOR_EXITED: (p) => `${(p?.visitorName as string) ?? 'Your visitor'} has exited the estate.`,
  INVITATION_EXPIRED: (p) => `The invitation for ${(p?.visitorName as string) ?? 'your visitor'} expired.`,
  INVITATION_CREATED: (p) => `Invitation created for ${(p?.visitorName as string) ?? 'your visitor'}.`,
  INVITATION_REVOKED: (p) => `Invitation for ${(p?.visitorName as string) ?? 'your visitor'} was revoked.`,
};

function describe(notification: AppNotification): string {
  const describer = NOTIFICATION_COPY[notification.type];
  return describer ? describer(notification.payload) : notification.type;
}

export function NotificationBell() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-400 transition-colors duration-150 ease-premium hover:bg-white/[0.06] hover:text-ink"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-bg">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="dropdown-panel absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-card shadow-card animate-fade-up">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3.5">
            <span className="font-display text-base font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="text-xs font-medium text-brass hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-ink-400">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-400">
                No notifications yet.
              </p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => markRead(notification.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-ink-100 px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-white/[0.04] ${
                    notification.readAt ? '' : 'bg-brass-50/50'
                  }`}
                >
                  <span className="flex items-start gap-2 text-sm text-ink">
                    {!notification.readAt && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brass" />
                    )}
                    {describe(notification)}
                  </span>
                  <span className="pl-3.5 text-xs text-ink-400">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
