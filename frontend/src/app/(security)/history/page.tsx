'use client';

// Security-side entry/exit history — CLAUDE.md §22/§53. Backed by
// GET /entry-exit/history, scoped to the officer's own estate, since
// "what happened at this estate" is the useful question here. Restyled
// to match the officer mockups' Visitor Lookup / activity list look —
// same data and endpoint as before.

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { formatRelativeTime, formatShortDate } from '@/lib/format';
import type { EntryExitHistoryItem } from '@/types/entry-exit';
import { ArrowDownLeftIcon, ArrowUpRightIcon } from '@/components/ui/icons';

export default function SecurityHistoryPage() {
  const [history, setHistory] = useState<EntryExitHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<EntryExitHistoryItem[]>('/entry-exit/history?limit=100')
      .then((result) => {
        if (!cancelled) setHistory(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load entry/exit history.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="animate-fade-up">
        <h1 className="font-display text-[32px] font-bold leading-tight text-ink">Entry &amp; Exit History</h1>
        <p className="mt-1 text-[15px] text-ink-400">Recent activity at this estate.</p>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50/40 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-card bg-ink-100/60" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink-100 px-6 py-12 text-center">
          <p className="text-ink-400">No entry or exit activity recorded yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {history.map((event) => {
            const isEntry = event.type === 'ENTRY';
            return (
              <li
                key={event.id}
                className="flex items-center justify-between gap-4 rounded-card glass-card px-5 py-4 transition-transform duration-150 ease-premium hover:scale-[1.01]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      isEntry ? 'bg-verified-50 text-verified' : 'bg-white/[0.06] text-brass'
                    }`}
                  >
                    {isEntry ? <ArrowDownLeftIcon className="h-4 w-4" /> : <ArrowUpRightIcon className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {event.visitorName}
                      <span className="ml-2 text-sm font-normal text-ink-400">
                        {isEntry ? 'Entered' : 'Exited'}
                      </span>
                    </p>
                    <p className="truncate text-sm text-ink-400">Flat {event.apartmentLabel}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm text-ink-400">
                  <p>{formatRelativeTime(event.occurredAt)}</p>
                  <p className="text-xs">{formatShortDate(event.occurredAt)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
