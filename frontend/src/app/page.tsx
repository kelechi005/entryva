'use client';

// Splash screen shown at the PWA's start_url (manifest.json) before
// redirecting to /login. This is a separate thing from the OS/browser's
// native PWA launch splash (built from the manifest icon + background
// color) — that one is a static image by platform constraint, nothing
// in-app can animate it. This screen is what takes over the instant
// this page mounts, so it's the first thing under our control the
// person actually sees, and previously it under-used that: the ring
// spun, but the mark itself just appeared inside it with no entrance,
// which read as static on a small screen with nothing else moving yet.
// The mark now pops in with a soft overshoot and a breathing glow
// behind it before the wordmark and loading dots follow.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), 1700);
    const navTimer = setTimeout(() => router.replace('/login'), 2000);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(navTimer);
    };
  }, [router]);

  return (
    <main
      className={`ambient-glow flex min-h-screen flex-col items-center justify-center gap-8 transition-opacity duration-300 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-brass/20 blur-xl animate-glow-pulse" />
        <span className="absolute inset-0 rounded-full border-2 border-brass/15" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-t-brass border-r-transparent border-b-transparent border-l-transparent" />
        {/* eslint-disable-next-line @next/next/no-img-element -- small local asset, next/image isn't set up elsewhere in this codebase */}
        <img
          src="/brand/entryva-mark.png"
          alt=""
          className="relative h-16 w-16 rounded-2xl shadow-glow animate-logo-pop"
        />
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/entryva-logo-full.png"
        alt="Entryva"
        className="h-7 w-auto opacity-0 animate-fade-up [animation-delay:450ms] [animation-fill-mode:forwards]"
      />

      <div className="flex items-center gap-1.5 opacity-0 animate-fade-up [animation-delay:650ms] [animation-fill-mode:forwards]">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brass [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brass [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brass" />
      </div>
    </main>
  );
}
