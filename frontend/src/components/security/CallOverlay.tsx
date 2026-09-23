'use client';

// Mounted once in (security)/layout.tsx so it's visible regardless of
// which page (gate/history) the officer is on — a ringing call can't
// wait for them to be on a specific screen.
//
// Previously 'calling'/'connected'/'ended' rendered as a small pill
// docked to the bottom of whatever page was underneath — functional,
// but it read as a background status chip rather than "you are on a
// phone call right now", and left the officer's screen still showing
// (and tappable into) gate/history controls mid-call. This is now one
// dedicated full-screen view for the whole call lifecycle — ringing,
// dialing, connected, and the brief "ended" state before it closes —
// matching the weight a live call between two officers actually has.

import { useEffect, useState } from 'react';
import { useCall } from '@/lib/calls/CallProvider';
import { PhoneIcon, PhoneOffIcon, MicIcon, MicOffIcon } from '@/components/ui/icons';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Ticking mm:ss elapsed since `connectedAt`. Returns null before the
 * call has actually connected — callers decide what to show instead. */
function useElapsed(connectedAt: number | null): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!connectedAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [connectedAt]);

  if (!connectedAt) return null;
  return formatDuration(Date.now() - connectedAt);
}

export function CallOverlay() {
  const {
    phase,
    incomingCall,
    peerName,
    errorMessage,
    connectedAt,
    acceptCall,
    declineCall,
    hangUp,
    muted,
    toggleMute,
  } = useCall();
  const elapsed = useElapsed(connectedAt);

  if (phase === 'idle') return null;

  const ringing = phase === 'ringing' && incomingCall;
  const name = peerName ?? 'Officer';

  let statusText: string;
  if (ringing) statusText = 'Incoming call\u2026';
  else if (phase === 'calling') statusText = 'Calling\u2026';
  else if (phase === 'connected') statusText = elapsed ?? 'Connected';
  else statusText = errorMessage ?? 'Call ended';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${name}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between ambient-glow px-6 py-14"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
        Officer Call
      </span>

      <div className="flex flex-col items-center gap-4">
        <div
          className={`flex h-28 w-28 items-center justify-center rounded-full text-3xl font-semibold text-ink glass-card ${
            ringing || phase === 'calling' ? 'animate-pulse' : ''
          }`}
        >
          {initials(name)}
        </div>
        <div className="text-center">
          <p className="font-display text-2xl font-bold text-ink">{name}</p>
          <p
            className={`mt-1 text-sm ${
              phase === 'ended' && errorMessage ? 'text-alert' : 'text-ink-400'
            }`}
          >
            {statusText}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {ringing && (
          <>
            <button
              type="button"
              onClick={declineCall}
              aria-label="Decline"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-alert text-white shadow-floating transition-transform duration-150 ease-premium hover:scale-105 active:scale-95"
            >
              <PhoneOffIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={acceptCall}
              aria-label="Accept"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-verified text-white shadow-floating transition-transform duration-150 ease-premium hover:scale-105 active:scale-95"
            >
              <PhoneIcon className="h-6 w-6" />
            </button>
          </>
        )}

        {(phase === 'calling' || phase === 'connected') && (
          <>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              aria-pressed={muted}
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors duration-150 ease-premium ${
                muted ? 'bg-alert/20 text-alert' : 'glass-card text-ink'
              }`}
            >
              {muted ? <MicOffIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={hangUp}
              aria-label="Hang up"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-alert text-white shadow-floating transition-transform duration-150 ease-premium hover:scale-105 active:scale-95"
            >
              <PhoneOffIcon className="h-6 w-6" />
            </button>
          </>
        )}

        {phase === 'ended' && <div className="h-16" aria-hidden="true" />}
      </div>
    </div>
  );
}
