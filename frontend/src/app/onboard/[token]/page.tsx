'use client';

// Public resident-onboarding page — the other half of the resident-invite
// flow (see ResidentInvitesService). No login required: this is where a
// resident lands after clicking the one-time link an admin emailed them.
//
// The apartment/building shown here is READ-ONLY by design. The admin
// already decided which apartment this invite is bound to when they sent
// it (CreateResidentForm) — nothing on this page can change that. All the
// resident provides is their own name and a password of their choosing.

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';
import type { PublicResidentInvitePreview } from '@/types/resident-invite';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; invite: PublicResidentInvitePreview }
  | { status: 'done' };

export default function ResidentOnboardPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // GET is a preview only — it does not consume the token. See
    // ResidentInvitesService.previewByToken for why that matters (email
    // security scanners pre-fetching links).
    apiFetch<PublicResidentInvitePreview>(`/resident-invites/public/${params.token}`)
      .then((invite) => {
        if (!cancelled) setState({ status: 'ready', invite });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              err instanceof Error
                ? err.message
                : 'This invite link is invalid, expired, or has already been used.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!displayName.trim()) {
      setFormError('Enter your full name.');
      return;
    }
    if (password.length < 8) {
      setFormError('Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords don\u2019t match.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch(`/resident-invites/public/${params.token}`, {
        method: 'POST',
        body: JSON.stringify({
          displayName: displayName.trim(),
          phone: phone.trim() || undefined,
          password,
        }),
      });
      setState({ status: 'done' });
    } catch (err) {
      // Surfaces the backend's 409 verbatim (e.g. someone else completed
      // this apartment's invite in the meantime) rather than a generic
      // message, since that's genuinely useful information here.
      setFormError(err instanceof Error ? err.message : 'Could not complete your account setup.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
        <img src="/brand/entryva-mark.png" alt="Entryva" className="h-14 w-14 rounded-2xl shadow-glow" />
        <p className="font-display text-2xl font-bold text-ink">Set up your account</p>
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
          <p className="mt-4 text-sm text-ink-400">
            Ask your estate admin to resend your invite.
          </p>
        </div>
      )}

      {state.status === 'done' && (
        <div className="glass-card w-full max-w-sm rounded-2xl p-8 text-center">
          <p className="mb-2 text-lg font-semibold text-ink">You&rsquo;re all set</p>
          <p className="text-ink-400">Your account has been created.</p>
          <Button fullWidth className="mt-6" onClick={() => router.push('/login')}>
            Go to sign in
          </Button>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="glass-card w-full max-w-sm rounded-2xl p-8">
          <div className="mb-6 rounded-xl border border-ink-100 bg-white/[0.03] p-4">
            <p className="text-sm text-ink-400">You&rsquo;re joining</p>
            <p className="font-display text-lg text-ink">
              {state.invite.buildingName} &middot; {state.invite.apartmentLabel}
            </p>
            <p className="text-sm text-ink-400">{state.invite.estateName}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field
              label="Full name"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
            />
            <Field
              label="Phone (optional)"
              type="tel"
              placeholder="e.g. +234 800 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Field
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />

            {formError && (
              <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
                {formError}
              </p>
            )}

            <Button type="submit" fullWidth disabled={submitting}>
              {submitting ? 'Creating your account\u2026' : 'Create account'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-ink-400">
            This link expires {new Date(state.invite.expiresAt).toLocaleString()}.
          </p>
        </div>
      )}
    </main>
  );
}
