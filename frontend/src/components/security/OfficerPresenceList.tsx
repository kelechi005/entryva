'use client';

import { useState } from 'react';
import { useCall } from '@/lib/calls/CallProvider';
import { PhoneIcon } from '@/components/ui/icons';

export function OfficerPresenceList() {
  const { connected, officers, phase, startCall } = useCall();
  const [open, setOpen] = useState(false);

  const others = officers; // presence broadcast already excludes the viewer's own socket on disconnect only;
  // the viewer's own entry is harmless to show but callable — filtered below.

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-400 hover:bg-white/[0.05] hover:text-ink"
      >
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-verified' : 'bg-ink-400'}`} />
        Team ({others.length})
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-ink-100 glass-card p-2 shadow-xl">
          {!connected && <p className="px-2 py-2 text-xs text-ink-400">Connecting\u2026</p>}
          {connected && others.length === 0 && (
            <p className="px-2 py-2 text-xs text-ink-400">No other officers online right now.</p>
          )}
          <ul className="flex flex-col gap-1">
            {others.map((officer) => (
              <li key={officer.userId} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                <span className="truncate text-sm text-ink">{officer.displayName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    startCall(officer);
                  }}
                  disabled={phase !== 'idle'}
                  aria-label={`Call ${officer.displayName}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-verified/20 text-verified hover:bg-verified/30 disabled:opacity-40"
                >
                  <PhoneIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
