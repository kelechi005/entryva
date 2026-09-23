'use client';

// Several screens set a one-off success message (gate page's `banner`,
// CreateResidentForm's `success`) that previously had no timer at all —
// it just sat on screen until something else happened to clear it
// (switching modes, submitting again), which on the gate page in
// particular meant "Obinna was let in." could still be showing an hour
// later. This hook is the fix, applied at each call site: pass the
// value and its setter, and it schedules a clear a few seconds after
// the value last changed to something non-null.
//
// Deliberately dumb (no pause-on-hover, no manual-dismiss wiring) —
// every current caller already offers its own way to dismiss early
// (any other action on the page clears these same setters), so this
// only needs to handle the "operator has moved on and never touched
// it again" case.

import { useEffect } from 'react';

const DEFAULT_DISMISS_MS = 5000;

export function useAutoDismiss(
  value: string | null,
  clear: () => void,
  ms: number = DEFAULT_DISMISS_MS,
): void {
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(clear, ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);
}
