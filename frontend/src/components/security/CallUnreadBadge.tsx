'use client';

// Rendered only next to the "Call" nav icon (see (security)/layout.tsx).
// A separate tiny component rather than inline logic in the layout so
// the layout itself doesn't need to know about messaging at all -- it
// just drops this in next to one icon.

import { useCall } from '@/lib/calls/CallProvider';
import { useThreadSummaries } from '@/hooks/useMessaging';

export function CallUnreadBadge() {
  const { socket, ownUserId } = useCall();
  const { threads } = useThreadSummaries(socket, ownUserId);
  const total = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  if (total === 0) return null;

  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[9px] font-semibold leading-none text-white">
      {total > 9 ? '9+' : total}
    </span>
  );
}
