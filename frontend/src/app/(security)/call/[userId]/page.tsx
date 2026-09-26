'use client';

// One officer's conversation thread -- messages render like every chat
// app (own messages right-aligned/accented, the other person's
// left-aligned/neutral, oldest at the top), with a header that carries
// the same online-status + Call affordance the list screen has, so
// starting a voice call is one tap away without leaving the thread.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCall } from '@/lib/calls/CallProvider';
import { useThread, useThreadSummaries } from '@/hooks/useMessaging';
import { ChevronRightIcon, PhoneIcon, SendIcon } from '@/components/ui/icons';
import { formatClockTime } from '@/lib/format';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function ThreadPage() {
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const otherUserId = params.userId;

  const { officers, phase, startCall, socket, ownUserId } = useCall();
  const { messages, loading, sending, send } = useThread(socket, ownUserId, otherUserId);
  // listThreadSummaries (backend) returns every active officer on the
  // estate, not just those currently online -- this is where the header
  // gets a reliable name from, independent of live presence.
  const { threads } = useThreadSummaries(socket, ownUserId);

  const officer = officers.find((o) => o.userId === otherUserId);
  const online = Boolean(officer);
  const thread = threads.find((t) => t.officer.userId === otherUserId);
  const name = officer?.displayName ?? thread?.officer.displayName ?? 'Officer';

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const body = draft;
    setDraft('');
    try {
      await send(body);
    } catch {
      // Failed send: put the draft back rather than silently losing it --
      // an officer's message about a gate incident is not something to
      // just drop because a request failed.
      setDraft(body);
    }
  }

  return (
    <>
      <div className="flex h-[100dvh] flex-col lg:hidden">
        <header className="flex items-center gap-3 border-b border-ink-100 bg-black/40 px-4 py-3 backdrop-blur-glass">
          <button
            type="button"
            onClick={() => router.push('/call')}
            aria-label="Back to officers"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors duration-150 ease-premium hover:text-ink"
          >
            <ChevronRightIcon className="h-5 w-5 rotate-180" />
          </button>

          <div className="relative shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-ink">
              {initials(name)}
            </div>
            {online && (
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-black bg-verified" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{name}</p>
            <p className="text-xs text-ink-400">{online ? 'Online' : 'Offline'}</p>
          </div>

          <button
            type="button"
            onClick={() => officer && startCall(officer)}
            disabled={!officer || phase !== 'idle'}
            aria-label={`Call ${name}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-verified text-white transition-transform duration-150 ease-premium hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          >
            <PhoneIcon className="h-4 w-4" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {loading && <p className="text-center text-sm text-ink-400">Loading\u2026</p>}

          {!loading && messages.length === 0 && (
            <p className="mt-10 text-center text-sm text-ink-400">
              No messages yet -- say hello.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {messages.map((message) => {
              const mine = message.fromUserId === ownUserId;
              return (
                <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? 'bg-brass text-black' : 'glass-card text-ink'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? 'text-black/60' : 'text-ink-400'}`}>
                      {formatClockTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-ink-100 px-4 py-3">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message"
            className="flex-1 rounded-full border border-ink-100 bg-white/5 px-4 py-2.5 text-sm text-ink placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brass/50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass text-black transition-transform duration-150 ease-premium hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </form>
      </div>

      <main className="hidden min-h-[50vh] flex-col items-center justify-center gap-2 px-5 py-20 text-center lg:flex">
        <p className="font-display text-lg font-semibold text-ink">Mobile only</p>
        <p className="max-w-xs text-sm text-ink-400">
          Messaging and calling other officers is available from the Entryva mobile app or a narrower browser window.
        </p>
      </main>
    </>
  );
}
