'use client';

// "Extend" on a pass the resident created. Opens a small row of choices;
// the server checks the estate's rules and who is asking.

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { InvitationStatus } from '@/types/invitation';

export interface ExtendResult {
  id: string;
  validFrom: string;
  validUntil: string;
  status: InvitationStatus;
}

const OPTIONS = [
  { minutes: 30, label: '+30 min' },
  { minutes: 60, label: '+1 hour' },
  { minutes: 120, label: '+2 hours' },
];

interface Props {
  invitationId: string;
  onExtended: (result: ExtendResult) => void;
}

export function ExtendPassButton({ invitationId, onExtended }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function extend(minutes: number) {
    setBusy(minutes);
    setError(null);
    try {
      const result = await apiFetch<ExtendResult>(`/invitations/${invitationId}/extend`, {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      });
      onExtended(result);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extend this pass.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setError(null);
        }}
        aria-expanded={open}
        className="rounded-pill px-4 py-2 text-sm font-medium text-brass hover:underline"
      >
        Extend
      </button>
      {open && (
        <div className="flex basis-full flex-wrap items-center gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.minutes}
              type="button"
              disabled={busy !== null}
              onClick={() => void extend(o.minutes)}
              className="glass-card rounded-pill px-4 py-2 text-sm font-medium text-ink transition-colors duration-150 ease-premium hover:bg-white/[0.06] disabled:opacity-50"
            >
              {busy === o.minutes ? 'Extending\u2026' : o.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="basis-full text-sm text-alert">
          {error}
        </p>
      )}
    </>
  );
}
