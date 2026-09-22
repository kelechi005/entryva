'use client';

// Shows invites the admin has sent that haven't been completed yet, with
// resend and cancel actions. Sits under the "Invite a resident" form on
// the residents page. Pulls from GET /admin/resident-invites and filters
// to PENDING/EXPIRED client-side — small list, and showing an invite
// that failed to resend is useful information, not noise.

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CopyLinkBox } from '@/components/admin/CopyLinkBox';
import { apiFetch } from '@/lib/api-client';
import type { AdminResidentInvite } from '@/types/admin';

function formatExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `expires in ${minutes}m`;
  return `expires in ${Math.round(minutes / 60)}h`;
}

export function PendingInvitesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [invites, setInvites] = useState<AdminResidentInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // Keyed by invite id — this is the exact bug real-world usage
  // surfaced: a resend can return success while Resend itself failed,
  // so the fallback link has to be shown per-invite, not just once.
  const [fallbackLinks, setFallbackLinks] = useState<Record<string, string>>({});
  const [fallbackStatuses, setFallbackStatuses] = useState<Record<string, 'failed' | 'not_configured'>>({});

  // Cancelling is a two-step reveal: clicking "Cancel" opens an inline,
  // optional reason field rather than immediately cancelling — a stray
  // click shouldn't kill an invite outright.
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const load = useCallback(() => {
    apiFetch<AdminResidentInvite[]>('/admin/resident-invites')
      .then((all) => setInvites(all.filter((i) => i.status === 'PENDING' || i.status === 'EXPIRED')))
      .catch(() => setError('Could not load pending invites.'));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function resend(invite: AdminResidentInvite) {
    setResendingId(invite.id);
    setStatusMessage(null);
    setError(null);
    setFallbackLinks((prev) => {
      const next = { ...prev };
      delete next[invite.id];
      return next;
    });
    try {
      const result = await apiFetch<{
        inviteUrl: string;
        emailSent: boolean;
        emailStatus: 'sent' | 'failed' | 'not_configured';
      }>(`/admin/resident-invites/${invite.id}/resend`, { method: 'POST' });
      if (result.emailSent) {
        setStatusMessage(`New link sent to ${invite.email}.`);
      } else {
        setFallbackLinks((prev) => ({ ...prev, [invite.id]: result.inviteUrl }));
        setFallbackStatuses((prev) => ({
          ...prev,
          [invite.id]: result.emailStatus === 'not_configured' ? 'not_configured' : 'failed',
        }));
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the invite.');
    } finally {
      setResendingId(null);
    }
  }

  function startCancel(invite: AdminResidentInvite) {
    setCancelingId(invite.id);
    setCancelReason('');
    setError(null);
    setStatusMessage(null);
  }

  async function confirmCancel(invite: AdminResidentInvite) {
    setCancelSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/admin/resident-invites/${invite.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      setCancelingId(null);
      setStatusMessage(`Invite to ${invite.email} was cancelled.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the invite.');
    } finally {
      setCancelSubmitting(false);
    }
  }

  if (invites.length === 0 && !error) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ink-100 glass-card p-6">
      <h3 className="font-display text-base text-ink">Pending invites</h3>
      {error && <p className="text-sm text-alert">{error}</p>}
      {statusMessage && <p className="text-sm text-verified">{statusMessage}</p>}
      <ul className="flex flex-col gap-2">
        {invites.map((invite) => (
          <li key={invite.id} className="rounded-lg bg-mist px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-ink">{invite.email}</p>
                <p className="text-xs text-ink-400">
                  {invite.apartment.building.name} &middot; {invite.apartment.flatNumber} &middot;{' '}
                  {invite.status === 'EXPIRED' ? 'expired' : formatExpiry(invite.expiresAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-3 !py-1.5 !text-xs"
                  disabled={resendingId === invite.id}
                  onClick={() => resend(invite)}
                >
                  {resendingId === invite.id ? 'Sending\u2026' : 'Resend'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="!px-3 !py-1.5 !text-xs text-alert hover:bg-alert-50"
                  onClick={() => startCancel(invite)}
                >
                  Cancel
                </Button>
              </div>
            </div>

            {fallbackLinks[invite.id] && (
              <div className="mt-2 border-t border-ink-100 pt-2">
                <CopyLinkBox url={fallbackLinks[invite.id]} status={fallbackStatuses[invite.id]} />
              </div>
            )}

            {cancelingId === invite.id && (
              <div className="mt-2 flex flex-col gap-2 border-t border-ink-100 pt-2">
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason (optional)"
                  maxLength={280}
                  className="w-full rounded-lg border border-ink-100 bg-white/[0.03] px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass"
                />
                <p className="text-xs text-ink-400">
                  The resident will get an email letting them know this invite was cancelled.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={cancelSubmitting}
                    onClick={() => setCancelingId(null)}
                  >
                    Never mind
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={cancelSubmitting}
                    onClick={() => confirmCancel(invite)}
                  >
                    {cancelSubmitting ? 'Cancelling\u2026' : 'Confirm cancel'}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
