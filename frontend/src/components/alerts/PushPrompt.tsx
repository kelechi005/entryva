'use client';

// A slim, dismissible reminder at the top of the app: "turn on phone
// notifications". It only appears when it can actually work (push is
// available, switched on for the estate, and not yet on), and "Not now"
// keeps it away for a week.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePushStatus } from '@/hooks/usePushStatus';

const KEY = 'entryva-push-prompt-dismissed';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < WEEK_MS;
  } catch {
    return false;
  }
}

export function PushPrompt() {
  const { state, busy, enable } = usePushStatus();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(recentlyDismissed());
  }, []);

  if (state !== 'off' || hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Private mode: it just comes back next visit.
    }
    setHidden(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-brass/30 bg-brass-50 px-4 py-3 text-sm text-ink">
      <span className="flex-1">Get visitor arrivals and security alerts on your phone, even when the app is closed.</span>
      <span className="flex items-center gap-3">
        <button
          onClick={() => void enable()}
          disabled={busy}
          className="font-semibold text-brass underline disabled:opacity-50"
        >
          {busy ? 'Turning on\u2026' : 'Turn on'}
        </button>
        <Link href="/alerts" className="text-ink-400 underline">
          More
        </Link>
        <button onClick={dismiss} className="text-ink-400 underline">
          Not now
        </button>
      </span>
    </div>
  );
}
