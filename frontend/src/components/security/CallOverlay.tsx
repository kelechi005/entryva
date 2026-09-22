'use client';

// Mounted once in (security)/layout.tsx so it's visible regardless of
// which page (gate/history) the officer is on — a ringing call can't
// wait for them to be on a specific screen.

import { useCall } from '@/lib/calls/CallProvider';
import { PhoneIcon, PhoneOffIcon, MicOffIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';

export function CallOverlay() {
  const { phase, incomingCall, peerName, errorMessage, acceptCall, declineCall, hangUp, muted, toggleMute } =
    useCall();

  if (phase === 'idle') return null;

  return (
    <>
      {phase === 'ringing' && incomingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-xs rounded-2xl border border-ink-100 glass-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brass/20 text-brass animate-pulse">
              <PhoneIcon className="h-6 w-6" />
            </div>
            <p className="font-display text-lg text-ink">{peerName}</p>
            <p className="text-sm text-ink-400">Incoming call\u2026</p>
            <div className="mt-6 flex justify-center gap-4">
              <button
                type="button"
                onClick={declineCall}
                aria-label="Decline"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-alert text-white hover:opacity-90"
              >
                <PhoneOffIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={acceptCall}
                aria-label="Accept"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-verified text-white hover:opacity-90"
              >
                <PhoneIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {(phase === 'calling' || phase === 'connected' || phase === 'ended') && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-ink-100 glass-card px-4 py-2 shadow-xl">
          <span className={`h-2 w-2 rounded-full ${phase === 'connected' ? 'bg-verified' : 'bg-brass animate-pulse'}`} />
          <span className="text-sm text-ink">
            {phase === 'calling' && `Calling ${peerName}\u2026`}
            {phase === 'connected' && `On call with ${peerName}`}
            {phase === 'ended' && (errorMessage ?? 'Call ended')}
          </span>
          {phase !== 'ended' && (
            <>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  muted ? 'bg-alert/20 text-alert' : 'bg-white/[0.06] text-ink-400'
                }`}
              >
                <MicOffIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={hangUp}
                aria-label="Hang up"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-alert text-white"
              >
                <PhoneOffIcon className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
