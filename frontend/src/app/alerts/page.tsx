'use client';

// /alerts - where every notice, security alert and emergency lives, and
// where every push notification opens. It sits outside the three role
// layouts (a URL can only belong to one), so it has its own slim header
// with a way back to the person's own home screen.

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { AlertsCenter } from '@/components/alerts/AlertsCenter';
import { ChevronRightIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import type { AuthenticatedUser } from '@/types/auth';

const HOME: Record<string, string> = {
  RESIDENT: '/dashboard',
  SECURITY_OFFICER: '/gate',
  ESTATE_ADMIN: '/estate',
};

export default function AlertsPage() {
  const [me, setMe] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AuthenticatedUser>('/auth/me')
      .then(setMe)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your account.'));
  }, []);

  const supported = me && (me.role === 'RESIDENT' || me.role === 'SECURITY_OFFICER' || me.role === 'ESTATE_ADMIN');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-5 py-6">
      <header className="flex items-center justify-between gap-3">
        <Link
          href={me ? (HOME[me.role] ?? '/') : '/'}
          className="glass-surface inline-flex items-center gap-1 rounded-full px-4 py-2.5 text-sm font-medium text-ink"
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" /> Back
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Alerts</h1>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}
      {!me && !error && <p className="text-sm text-ink-400">Loading&hellip;</p>}
      {me && !supported && (
        <p className="text-sm text-ink-400">Alerts are for residents, security officers and the estate admin.</p>
      )}
      {me && supported && (
        <Suspense fallback={<p className="text-sm text-ink-400">Loading&hellip;</p>}>
          <AlertsCenter role={me.role as 'RESIDENT' | 'SECURITY_OFFICER' | 'ESTATE_ADMIN'} />
        </Suspense>
      )}
    </main>
  );
}
