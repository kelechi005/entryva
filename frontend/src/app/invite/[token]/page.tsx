'use client';

// Public visitor link page — mockup 5, "Visitor Link Page (Mobile View)".
// No login required. The visitor only ever sees this and the QR/code on it;
// the resident's name, apartment, and estate are the only context they need.

import { useEffect, useState } from 'react';
import { InvitationTicket } from '@/components/visitor/InvitationTicket';
import { StatusBadge, toStatusBadgeKey } from '@/components/ui/StatusBadge';
import { ClockIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import type { PublicInvitation } from '@/types/invitation';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; invitation: PublicInvitation };

// findPublicByToken (backend) returns 200 with the invitation's real
// status even once it's EXPIRED or USED — it only ever throws (which
// lands in the 'error' branch below) for REVOKED/CANCELLED/not-found.
// That's deliberate on the backend side (an expired link should still
// tell the visitor *something* rather than a bare 404), but it means
// this page previously rendered the same live, present-this-at-the-gate
// ticket regardless of status — a link scanned after its validUntil (or
// a one-time link already used) looked exactly as valid as a fresh one.
// Only ACTIVE (and PENDING — scheduled but not yet started) get the
// real ticket; anything else gets an explanatory card instead.
const LIVE_STATUSES = new Set(['ACTIVE', 'PENDING']);

function inactiveMessage(status: string): string {
  switch (status) {
    case 'EXPIRED':
      return 'This visit window has ended. Ask your host to send a new invitation if you still need access.';
    case 'USED':
      return 'This invitation has already been used to enter and cannot be reused.';
    default:
      return 'This invitation is no longer active.';
  }
}

export default function VisitorInvitePage({ params }: { params: { token: string } }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicInvitation>(`/invitations/public/${params.token}`)
      .then((invitation) => {
        if (!cancelled) setState({ status: 'ready', invitation });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'This invitation link is invalid, expired, or has been revoked.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  return (
    <main className="flex min-h-screen flex-col px-5 pb-10 pt-10">
      <header className="mb-8 flex flex-col items-center gap-1 text-center">
        <p className="font-display text-2xl font-bold text-ink">You&rsquo;re invited</p>
        {state.status === 'ready' && (
          <p className="text-ink-400">to visit {state.invitation.residentName}</p>
        )}
      </header>

      {state.status === 'loading' && (
        <div className="glass-card mx-auto flex w-full max-w-sm animate-pulse flex-col gap-4 rounded-ticket p-10">
          <div className="mx-auto h-40 w-40 rounded-2xl bg-white/10" />
          <div className="mx-auto h-4 w-32 rounded bg-white/10" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="glass-card mx-auto w-full max-w-sm rounded-ticket p-8 text-center">
          <p className="mb-2 text-lg font-semibold text-ink">Invitation not found</p>
          <p className="text-ink-400">{state.message}</p>
        </div>
      )}

      {state.status === 'ready' && LIVE_STATUSES.has(state.invitation.status) && (
        <InvitationTicket
          invitation={state.invitation}
          qrValue={window.location.href}
        />
      )}

      {state.status === 'ready' && LIVE_STATUSES.has(state.invitation.status) && (
        <p className="mt-6 text-center text-sm text-ink-400">
          Please present this QR code at the gate.
        </p>
      )}

      {state.status === 'ready' && !LIVE_STATUSES.has(state.invitation.status) && (
        <div className="glass-card mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-ticket p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-ink-400">
            <ClockIcon className="h-6 w-6" />
          </div>
          <StatusBadge status={toStatusBadgeKey(state.invitation.status)} />
          <p className="text-ink-400">{inactiveMessage(state.invitation.status)}</p>
        </div>
      )}
    </main>
  );
}
