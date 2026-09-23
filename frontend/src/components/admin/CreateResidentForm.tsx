'use client';

// Admin side of the resident-invite flow: the admin picks the
// apartment + types the resident's email, and that's it — no password
// is ever set here. The resident gets an emailed one-time link (see
// ResidentInvitesService) and chooses their own password when they use
// it. The apartment/identity binding is decided right here, once, and
// nothing the resident fills in later can change it.

import { FormEvent, useEffect, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { CopyLinkBox } from '@/components/admin/CopyLinkBox';
import { apiFetch } from '@/lib/api-client';
import { useAutoDismiss } from '@/hooks/useAutoDismiss';
import type { AdminApartment } from '@/types/admin';

interface CreateResidentFormProps {
  onCreated: () => void;
}

export function CreateResidentForm({ onCreated }: CreateResidentFormProps) {
  const [apartments, setApartments] = useState<AdminApartment[]>([]);
  const [email, setEmail] = useState('');
  const [apartmentId, setApartmentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useAutoDismiss(success, () => setSuccess(null));
  // Set only when the invite was created but the email failed to send
  // (see EmailService/ResidentInvitesService — a delivery failure is
  // deliberately non-fatal to invite creation) — the link is the
  // fallback so the admin isn't stuck with no way to reach the resident.
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);
  const [fallbackStatus, setFallbackStatus] = useState<'failed' | 'not_configured'>('failed');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<AdminApartment[]>('/admin/apartments')
      .then(setApartments)
      .catch(() => setApartments([]));
  }, []);

  const selectedApartment = apartments.find((a) => a.id === apartmentId);
  // The backend is the real gate here (this a 409 either way) — this is
  // just so the admin sees the problem before submitting instead of
  // after.
  const apartmentAlreadyOccupied = selectedApartment?.status === 'OCCUPIED';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFallbackLink(null);

    if (!email.trim() || !apartmentId) {
      setError('Choose an apartment and enter the resident\u2019s email.');
      return;
    }
    if (apartmentAlreadyOccupied) {
      setError('That apartment already has a resident assigned. Remove them first to reassign it.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<{
        inviteUrl: string;
        emailSent: boolean;
        emailStatus: 'sent' | 'failed' | 'not_configured';
      }>('/admin/resident-invites', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), apartmentId }),
      });
      setEmail('');
      setApartmentId('');
      if (result.emailSent) {
        setSuccess('Invite sent. The resident has 2 hours to open the link and set up their account.');
      } else {
        setFallbackLink(result.inviteUrl);
        setFallbackStatus(result.emailStatus === 'not_configured' ? 'not_configured' : 'failed');
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 glass-card rounded-2xl p-6">
      <h2 className="font-display text-xl text-ink">Invite a resident</h2>
      <p className="-mt-2 text-sm text-ink-400">
        We&rsquo;ll email a one-time link so they can set their own name and password. It expires in 2
        hours.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-700">Apartment</label>
        <select
          value={apartmentId}
          onChange={(e) => setApartmentId(e.target.value)}
          className="w-full rounded-lg border border-ink-100 bg-white/[0.03] px-3.5 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass"
        >
          {/*
            Explicit color + backgroundColor here (not Tailwind classes,
            not inherited from `text-ink`/`text-white` above) because the
            <option> popup is drawn by the OS/browser chrome, not by our
            CSS — it ignores the dark theme entirely and always renders
            on a light native surface. `text-ink` is white-on-white
            there (invisible except where the browser's own hover
            highlight happens to give it contrast), so every <option>
            needs its own readable colors regardless of the page theme.
          */}
          <option value="" style={{ color: '#111111', backgroundColor: '#FFFFFF' }}>
            Select an apartment&hellip;
          </option>
          {apartments.map((apt) => (
            <option
              key={apt.id}
              value={apt.id}
              style={{ color: '#111111', backgroundColor: '#FFFFFF' }}
            >
              {apt.building.name} &middot; {apt.flatNumber}
              {apt.status === 'OCCUPIED' ? ' (occupied)' : ''}
            </option>
          ))}
        </select>
        {apartments.length === 0 && (
          <p className="text-sm text-ink-400">
            No apartments yet. Add a building and apartment on the{' '}
            <a href="/properties" className="text-brass-700 underline">
              Buildings &amp; Apartments
            </a>{' '}
            page first.
          </p>
        )}
        {apartmentAlreadyOccupied && (
          <p className="rounded-lg bg-alert-50 px-3 py-2 text-sm text-alert">
            This apartment already has a resident. Remove the existing resident first if this is a
            re-assignment.
          </p>
        )}
      </div>

      <Field label="Resident's email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

      {error && <p className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">{error}</p>}
      {success && <p className="rounded-lg bg-verified-50 px-4 py-3 text-sm text-verified">{success}</p>}
      {fallbackLink && <CopyLinkBox url={fallbackLink} status={fallbackStatus} />}

      <Button type="submit" disabled={submitting || apartmentAlreadyOccupied}>
        {submitting ? 'Sending\u2026' : 'Send invite'}
      </Button>
    </form>
  );
}
