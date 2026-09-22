// CLAUDE.md §25 requires a "clear online/offline indicator" — this is
// intentionally simple (navigator.onLine + the browser's online/offline
// events) rather than an active connectivity probe, since the more
// important signal in practice is "did the last verification request
// actually succeed," which the gate page already tracks per-scan.

import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/** True for the kind of failure that means "the request never reached
 * the server" (offline, DNS failure, connection refused) as opposed to a
 * real error response the server sent back (4xx/5xx). Only the former
 * should trigger an offline fallback — a genuine validation error from
 * the server should be shown as such, not silently retried locally. */
export function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError;
}
