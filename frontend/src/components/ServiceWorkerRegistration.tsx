'use client';

import { useEffect } from 'react';

/**
 * Registers public/sw.js. A tiny client component rather than inline
 * script so it can use useEffect (register once, after hydration) and
 * so app/layout.tsx can stay a server component.
 *
 * Renders nothing — this is a side-effect-only component.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal: the app still works fully online without it, it just
      // loses the "survive a reload while offline" behavior described in
      // public/sw.js. Nothing user-facing to show for a registration
      // failure (e.g. an unsupported browser, or a dev proxy that
      // doesn't serve /sw.js at the root).
    });
  }, []);

  return null;
}
