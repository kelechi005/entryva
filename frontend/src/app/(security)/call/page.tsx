'use client';

// The officer intercom hub -- a WhatsApp-style list of every other
// officer on duty: who's online, their last message, an unread badge,
// and a Call button, all in one screen. Previously this screen only
// did calling; text was the natural next step once the screen existed
// at all, since "call someone" and "message them instead because it's
// not urgent enough to interrupt them" are the same underlying need --
// reaching a specific colleague -- with different urgency, not
// different features.
//
// Deliberately mobile-only, per how officers actually use this: the
// desktop console is the gate-facing workstation, checked infrequently
// once an officer is stationed there, while the phone is what's on
// them for the intercom itself.

import Link from 'next/link';
import { useCall } from '@/lib/calls/CallProvider';
import { useThreadSummaries } from '@/hooks/useMessaging';
import { PhoneIcon } from '@/components/ui/icons';
import { formatRelativeTime } from '@/lib/format';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function CallPage() {
  const { connected, officers, phase, startCall, socket, ownUserId } = useCall();
  const { threads, loading } = useThreadSummaries(socket, ownUserId);

  const onlineIds = new Set(officers.map((o) => o.userId));

  return (
    <>
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-5 py-6 lg:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Officers</h1>
          <p className="mt-1 text-sm text-ink-400">Message or call anyone on duty.</p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-ink-100 px-4 py-2 w-fit text-xs font-medium text-ink-400">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-verified' : 'bg-ink-400'}`} />
          {connected ? `${officers.length} online` : 'Connecting\u2026'}
        </div>

        {!loading && threads.length === 0 && (
          <div className="glass-card flex flex-col items-center gap-2 rounded-ticket p-10 text-center">
            <p className="text-ink-400">No other officers on this estate yet.</p>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {threads.map((thread) => {
            const online = onlineIds.has(thread.officer.userId);
            const officer = officers.find((o) => o.userId === thread.officer.userId) ?? {
              userId: thread.officer.userId,
              displayName: thread.officer.displayName,
            };
            return (
              <li key={thread.officer.userId} className="glass-card flex items-center gap-3 rounded-2xl p-3">
                <Link
                  href={`/call/${thread.officer.userId}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="relative shrink-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-ink">
                      {initials(thread.officer.displayName)}
                    </div>
                    {online && (
                      <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-black bg-verified" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-ink">{thread.officer.displayName}</p>
                      {thread.lastMessage && (
                        <span className="shrink-0 text-[11px] text-ink-400">
                          {formatRelativeTime(thread.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-ink-400">
                        {thread.lastMessage ? thread.lastMessage.body : online ? 'Online' : 'Tap to message'}
                      </p>
                      {thread.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brass px-1.5 text-[11px] font-semibold text-black">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() => startCall(officer)}
                  disabled={phase !== 'idle' || !online}
                  aria-label={`Call ${thread.officer.displayName}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-verified text-white transition-transform duration-150 ease-premium hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
                >
                  <PhoneIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </main>

      {/* Reaching /call on a wide viewport directly (typed URL, bookmark,
          browser back/forward) shouldn't render a half-considered desktop
          layout of a screen that was designed and tested for mobile only. */}
      <main className="hidden min-h-[50vh] flex-col items-center justify-center gap-2 px-5 py-20 text-center lg:flex">
        <p className="font-display text-lg font-semibold text-ink">Mobile only</p>
        <p className="max-w-xs text-sm text-ink-400">
          Messaging and calling other officers is available from the Entryva mobile app or a narrower browser window.
        </p>
      </main>
    </>
  );
}
