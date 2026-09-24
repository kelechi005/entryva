'use client';

// Own screen for the intercom feature — previously this was a small
// "Team (N)" text button tucked into the header (mobile) or sidebar
// footer (desktop) that popped a narrow dropdown with officer names and
// a tiny phone icon squeezed in next to each one. Functional, but it
// read as a stray presence widget, not "this is how you call another
// officer" — nothing about a text label reading "Team" suggests tapping
// it starts a phone call. This gives the feature the weight (and the
// obvious "here's how you call someone" affordance) it actually needs.
//
// Deliberately mobile-only, per how officers actually use this: the
// desktop console is the gate-facing workstation, checked infrequently
// once an officer is stationed there, while the phone is what's on
// them for the intercom itself. The nav entry point to this screen is
// gated to the mobile dock (see (security)/layout.tsx); reaching this
// route directly on a wide viewport shows a short redirect notice
// instead of the officer list, so there's no half-built desktop version
// of this to accidentally ship.

import { useCall } from '@/lib/calls/CallProvider';
import { PhoneIcon } from '@/components/ui/icons';

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
  const { connected, officers, phase, startCall } = useCall();

  return (
    <>
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-5 py-6 lg:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Call an officer</h1>
          <p className="mt-1 text-sm text-ink-400">
            Reach another officer on duty directly — useful for a second opinion at the gate
            or handing off a shift.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-ink-100 px-4 py-2 w-fit text-xs font-medium text-ink-400">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-verified' : 'bg-ink-400'}`} />
          {connected ? `${officers.length} online` : 'Connecting…'}
        </div>

        {connected && officers.length === 0 && (
          <div className="glass-card flex flex-col items-center gap-2 rounded-ticket p-10 text-center">
            <p className="text-ink-400">No other officers are online right now.</p>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {officers.map((officer) => (
            <li
              key={officer.userId}
              className="glass-card flex items-center justify-between gap-3 rounded-2xl p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-ink">
                  {initials(officer.displayName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{officer.displayName}</p>
                  <p className="flex items-center gap-1.5 text-xs text-ink-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-verified" />
                    Online
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => startCall(officer)}
                disabled={phase !== 'idle'}
                className="flex items-center gap-1.5 rounded-full bg-verified px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 ease-premium hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              >
                <PhoneIcon className="h-4 w-4" />
                Call
              </button>
            </li>
          ))}
        </ul>
      </main>

      {/* Reaching /call on a wide viewport directly (typed URL, bookmark,
          browser back/forward) shouldn't render a half-considered desktop
          layout of a screen that was designed and tested for mobile only. */}
      <main className="hidden min-h-[50vh] flex-col items-center justify-center gap-2 px-5 py-20 text-center lg:flex">
        <p className="font-display text-lg font-semibold text-ink">Mobile only</p>
        <p className="max-w-xs text-sm text-ink-400">
          Officer calling is available from the Entryva mobile app or a narrower browser window.
        </p>
      </main>
    </>
  );
}
