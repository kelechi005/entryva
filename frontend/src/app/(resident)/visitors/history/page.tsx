'use client';

// Visitor History — every invitation the resident has created, styled as
// premium glass rows (dense table feel on desktop, stacked cards on
// mobile) rather than the plain bordered list this used to be.

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusBadge, toStatusBadgeKey } from '@/components/ui/StatusBadge';
import { apiFetch } from '@/lib/api-client';
import { formatVisitWindow, formatShortDate } from '@/lib/format';
import type { InvitationHistoryItem } from '@/types/invitation';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const FILTERS = ['All', 'Active', 'Scheduled', 'Expired'] as const;

export default function VisitorHistoryPage() {
  const [invitations, setInvitations] = useState<InvitationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  async function load() {
    try {
      const result = await apiFetch<InvitationHistoryItem[]>('/invitations');
      setInvitations(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your visitor history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await apiFetch(`/invitations/${id}`, { method: 'DELETE' });
      // Reflect the revocation immediately rather than waiting on a refetch —
      // the backend has already committed it by the time this resolves.
      setInvitations((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: 'REVOKED' } : inv)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke this invitation.');
    } finally {
      setRevokingId(null);
    }
  }

  const filtered = invitations.filter((inv) => {
    if (filter === 'All') return true;
    if (filter === 'Active') return inv.status === 'ACTIVE';
    if (filter === 'Scheduled') return inv.status === 'PENDING';
    if (filter === 'Expired') return inv.status === 'EXPIRED' || inv.status === 'USED';
    return true;
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header>
        <h1 className="font-display text-[32px] font-bold text-ink">Visitor history</h1>
        <p className="text-[15px] text-ink-400">Every invitation you&rsquo;ve created, past and present.</p>
      </header>

      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-pill px-4 py-2 text-sm font-medium transition-colors duration-150 ease-premium ${
              filter === f
                ? 'bg-gradient-to-b from-brass to-[#3B82F6] text-white shadow-floating'
                : 'glass-card text-ink-400 hover:text-ink'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[90px] animate-pulse rounded-card bg-white/[0.04]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-card px-6 py-12 text-center">
          <p className="text-ink-400">No visitor invitations {filter !== 'All' ? `in "${filter}"` : ''} yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((invitation) => {
            const canRevoke = invitation.status === 'ACTIVE' || invitation.status === 'PENDING';
            return (
              <li
                key={invitation.id}
                className="glass-card flex flex-col gap-4 rounded-card px-5 py-4 transition-colors duration-150 ease-premium hover:bg-white/[0.06] sm:min-h-[90px] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold text-ink">
                    {initials(invitation.visitorName)}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{invitation.visitorName}</p>
                      <StatusBadge status={toStatusBadgeKey(invitation.status)} />
                    </div>
                    <p className="text-sm text-ink-400">
                      {formatVisitWindow(invitation.validFrom, invitation.validUntil)}
                    </p>
                    <p className="text-xs text-ink-400">
                      Created {formatShortDate(invitation.createdAt)}
                      {invitation.entryPolicy === 'ONE_TIME' ? ' · One-time entry' : ' · Multi-entry'}
                    </p>
                  </div>
                </div>

                {canRevoke && (
                  <Button
                    variant="ghost"
                    onClick={() => handleRevoke(invitation.id)}
                    disabled={revokingId === invitation.id}
                    className="self-start sm:self-auto"
                  >
                    {revokingId === invitation.id ? 'Revoking\u2026' : 'Revoke'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
