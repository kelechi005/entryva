'use client';

// Login screen — mockup 1. Split layout: an ink-navy panel carrying the
// brand moment (matches the public invite page's dark treatment, so the
// resident recognizes the same product), and a plain white form panel —
// the two registers (warmth vs. operational) meeting at one edge.

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';
import { ShieldIcon } from '@/components/ui/icons';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Separate from `error` deliberately — this isn't a failed attempt on
  // *this* screen, it's context for why the person landed back here at
  // all (see api-client.ts's forceSessionLogout), so it reads and is
  // styled as a neutral notice rather than a red alert.
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Read directly off window.location rather than useSearchParams() —
  // this hard-navigation redirect only ever happens in the real browser
  // (forceSessionLogout no-ops in non-browser/test environments), so
  // there's nothing to gain from wiring up Next's search-params hook
  // (and the Suspense boundary it'd require) for a value that's only
  // ever read once, on mount. The param is stripped from the URL right
  // after so a manual refresh of /login doesn't keep re-showing it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('sessionExpired') === '1') {
      setNotice('Your session has expired. Please sign in again.');
      params.delete('sessionExpired');
      const rest = params.toString();
      window.history.replaceState(null, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!identifier.trim() || !password) {
      setError('Enter your email or phone number and password.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      const me = await apiFetch<{ role: string }>('/auth/me');
      const destination =
        me.role === 'SECURITY_OFFICER'
          ? '/gate'
          : me.role === 'ESTATE_ADMIN' || me.role === 'SUPER_ADMIN'
            ? '/estate'
            : '/dashboard';
      router.push(destination);
    } catch {
      setError("That email/phone or password didn't match. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
      {/*
        Previously this grid had no max-width, so on a wide desktop
        monitor each half centered its content independently — the
        write-up on the left and the form on the right ended up pulled
        toward opposite edges of the screen with a wide, empty gap
        between them. Bounding it as one card fixes that: the gap
        between the two panels is now just their own padding, not
        whatever's left of the viewport.
      */}
      <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl lg:grid-cols-2 lg:border lg:border-ink-100 lg:shadow-card">
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-ink-100 bg-black/30 px-10 py-14 backdrop-blur-glass lg:flex">
          <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-brass/20 blur-[100px]" />
          <div className="relative flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
            <img src="/brand/entryva-mark.png" alt="" className="h-9 w-9 rounded-xl shadow-glow" />
            {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
            <img src="/brand/entryva-logo-full.png" alt="Entryva" className="h-5 w-auto" />
          </div>

          <div className="relative">
            <ShieldIcon className="mb-5 h-8 w-8 text-brass" />
            <p className="font-display text-3xl font-bold leading-snug text-ink">
              Safer communities, smarter access.
            </p>
            <p className="mt-4 text-ink-400">
              Invite a visitor, share a pass, and know the moment they arrive, without a single
              phone call to the gate.
            </p>
          </div>

          <div className="relative flex items-center justify-between gap-4">
            <p className="text-sm text-ink-400">&copy; {new Date().getFullYear()} Entryva</p>
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              Powered by
              {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
              <img src="/brand/axis-logo-credit.png" alt="Axis Technologies" className="h-3.5 w-auto opacity-80" />
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center bg-black/10 px-6 py-12 sm:px-10 lg:py-14">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-3xl font-bold text-ink">Welcome back</h1>
            <p className="mt-1 text-ink-400">Sign in to your account.</p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
              <Field
                label="Email or phone number"
                placeholder="you@estate.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
              />
              <Field
                label="Password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />

              {notice && !error && (
                <p role="status" className="rounded-lg bg-warn-50 px-4 py-3 text-sm text-warn">
                  {notice}
                </p>
              )}

              {error && (
                <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
                  {error}
                </p>
              )}

              <Button type="submit" fullWidth disabled={submitting}>
                {submitting ? 'Signing in\u2026' : 'Sign in'}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
