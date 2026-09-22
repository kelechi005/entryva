'use client';

// Visitor Verification Result / Invalid Verification States — mockups
// CLAUDE.md §18 & §19. One card, driven entirely by the outcome enum the
// backend already computed; this component never re-derives validity.
// Restyled to match the officer mockups' Verified/Invalid pass screens —
// same data and handlers as before, new Dark Luxury Glassmorphism look.

import { Button } from '@/components/ui/Button';
import { PhoneIcon, XIcon, CheckIcon, BuildingIcon, UserIcon, ClockIcon } from '@/components/ui/icons';
import type { VerificationResult } from '@/types/verification';

interface VerificationResultCardProps {
  result: VerificationResult;
  onAllowEntry: () => void;
  onDenyEntry: () => void;
  onCallResident: () => void;
  onDismiss: () => void;
  actionPending: boolean;
}

const OUTCOME_COPY: Record<
  Exclude<VerificationResult['outcome'], 'VALID'>,
  { title: string; body: string }
> = {
  EXPIRED: {
    title: 'Invitation Expired',
    body: 'This visitor invitation is no longer valid.',
  },
  NOT_YET_VALID: {
    title: 'Invitation Not Yet Valid',
    body: "This visitor isn't expected until the invitation's valid window opens.",
  },
  REVOKED: {
    title: 'Invitation Revoked',
    body: 'The resident cancelled this invitation.',
  },
  ALREADY_USED: {
    title: 'Invitation Already Used',
    body: 'This invitation was configured for one-time entry.',
  },
  NOT_FOUND: {
    title: 'Invitation Not Found',
    body: 'Check the QR code or visitor code.',
  },
};

// CLAUDE.md §25: "The UI must clearly indicate when verification is
// offline." One small badge, reused by both the valid and invalid card
// layouts below, rather than a whole separate offline card design.
function OfflineBadge() {
  return (
    <span className="rounded-pill bg-brass-50 px-3.5 py-1.5 text-xs font-semibold text-brass">
      Offline verification, using last synced data
    </span>
  );
}

export function VerificationResultCard({
  result,
  onAllowEntry,
  onDenyEntry,
  onCallResident,
  onDismiss,
  actionPending,
}: VerificationResultCardProps) {
  if (result.outcome !== 'VALID' || !result.invitation) {
    const copy = OUTCOME_COPY[result.outcome as Exclude<VerificationResult['outcome'], 'VALID'>];
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-[32px] border border-alert/30 bg-gradient-to-b from-alert/[0.08] to-white/[0.02] px-7 py-10 text-center shadow-card">
        {result.offline && <OfflineBadge />}
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-alert-50 text-alert">
          <XIcon className="h-7 w-7" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">{copy.title}</h2>
          <p className="mt-1.5 text-ink-400">{copy.body}</p>
        </div>
        <Button variant="secondary" fullWidth onClick={onDismiss}>
          Scan next visitor
        </Button>
      </div>
    );
  }

  const invitation = result.invitation;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 rounded-[32px] border border-verified/30 bg-gradient-to-b from-verified/[0.10] to-white/[0.02] px-7 py-9 shadow-card">
      <div className="flex flex-col items-center gap-2.5 text-center">
        {result.offline && <OfflineBadge />}
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-verified-50 text-verified">
          <CheckIcon className="h-7 w-7" />
        </span>
        <h2 className="font-display text-xl font-semibold text-ink">Visitor Verified</h2>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white/[0.03] px-5 py-5">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-400">
            <UserIcon className="h-3.5 w-3.5" /> Visitor
          </p>
          <p className="mt-0.5 text-base font-semibold text-ink">{invitation.visitorName}</p>
        </div>
        <div className="h-px bg-ink-100" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-400">Visiting</p>
            <p className="mt-0.5 truncate text-base font-medium text-ink">{invitation.residentName}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="flex items-center justify-end gap-1.5 text-[13px] font-medium text-ink-400">
              <BuildingIcon className="h-3.5 w-3.5" /> Apartment
            </p>
            <p className="mt-0.5 text-base font-medium text-ink">{invitation.apartmentLabel}</p>
          </div>
        </div>
        <div className="h-px bg-ink-100" />
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-400">
            <ClockIcon className="h-3.5 w-3.5" /> Valid Until
          </p>
          <p className="mt-0.5 text-base text-ink">
            {new Date(invitation.validUntil).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>

      <Button
        variant="secondary"
        fullWidth
        onClick={onCallResident}
        disabled={!invitation.residentPhone}
        title={!invitation.residentPhone ? 'No phone number on file for this resident.' : undefined}
        className="gap-2"
      >
        <PhoneIcon className="h-4 w-4" /> Call Resident
      </Button>

      <div className="flex gap-3">
        <Button variant="danger" fullWidth onClick={onDenyEntry} disabled={actionPending}>
          Deny Entry
        </Button>
        <Button fullWidth onClick={onAllowEntry} disabled={actionPending}>
          {actionPending ? 'Recording\u2026' : 'Allow Entry'}
        </Button>
      </div>
      {result.offline && (
        <p className="text-center text-xs text-ink-400">
          This decision will be recorded now and sent to the server once you&rsquo;re back online.
        </p>
      )}
    </div>
  );
}
