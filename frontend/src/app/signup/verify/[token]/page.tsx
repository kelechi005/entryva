'use client';

// Landing page for the emailed confirmation link. GET (page load) only
// previews — email security scanners pre-fetch links, and burning the
// one-time token on a scan would silently kill real signups. The
// button POSTs, which creates the estate and signs the admin in.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';

interface SignupPreview {
  estateName: string;
  adminName: string;
  email: string;
  expiresAt: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; preview: SignupPreview };

export default function VerifySignupPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<SignupPreview>(`/signup/verify/${params.token}`)
      .then((preview) => {
        if (!cancelled) setState({ status: 'ready', preview });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'This link is invalid or has expired.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  async function activate() {
    setSubmitting(true);
    setActionError(null);
    try {
      await apiFetch(`/signup/verify/${params.token}`, { method: 'POST' });
      // Session cookies were set by the response; go straight in.
      router.push('/estate');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not activate your estate.');
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
        <img src="/brand/entryva-mark.png" alt="Entryva" className="h-14 w-14 rounded-2xl shadow-glow" />
        <p className="font-display text-2xl font-bold text-ink">Activate your estate</p>
      </div>

      {state.status === 'loading' && (
        <div className="glass-card w-full max-w-sm animate-pulse rounded-2xl p-8">
          <div className="mx-auto h-4 w-40 rounded bg-white/10" />
          <div className="mx-auto mt-4 h-10 w-full rounded-lg bg-white/10" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="glass-card w-full max-w-sm rounded-2xl p-8 text-center">
          <p className="mb-2 text-lg font-semibold text-ink">Link not valid</p>
          <p className="text-ink-400">{state.message}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/signup" className="text-brass underline">
              Start a new signup
            </Link>
            <Link href="/login" className="text-sm text-ink-400 underline">
              Sign in
            </Link>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="glass-card w-full max-w-sm rounded-2xl p-8">
          <div className="mb-6 rounded-xl border border-ink-100 bg-white/[0.03] p-4">
            <p className="text-sm text-ink-400">You&rsquo;re activating</p>
            <p className="font-display text-lg text-ink">{state.preview.estateName}</p>
            <p className="text-sm text-ink-400">
              Admin: {state.preview.adminName} &middot; {state.preview.email}
            </p>
          </div>
          {actionError && (
            <p role="alert" className="mb-4 rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
              {actionError}
            </p>
          )}
          <Button fullWidth onClick={activate} disabled={submitting}>
            {submitting ? 'Activating\u2026' : 'Confirm & activate'}
          </Button>
          <p className="mt-4 text-center text-xs text-ink-400">
            This link expires {new Date(state.preview.expiresAt).toLocaleString()}.
          </p>
        </div>
      )}
    </main>
  );
}
