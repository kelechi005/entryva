'use client';

// Public estate signup. An estate manager describes the estate and
// creates their own admin login. Nothing is created until they click
// the link we email (see backend SignupService) — so the success state
// here is "check your email", never "you're in".

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';

// Curated on purpose: a 400-entry IANA list is unusable in a form. The
// browser's own zone is added at the top when it isn't already here.
const TIMEZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

const selectClasses =
  'w-full rounded-2xl border border-ink-100 bg-white/[0.03] px-4 py-3.5 text-[15px] font-medium text-ink ' +
  'backdrop-blur-glass focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass/60 [color-scheme:dark]';

export default function SignupPage() {
  const [estateName, setEstateName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [contactPhone, setContactPhone] = useState('');

  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [zones, setZones] = useState(TIMEZONES);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (local) {
        setTimezone(local);
        if (!TIMEZONES.includes(local)) setZones([local, ...TIMEZONES]);
      }
    } catch {
      // Keep the Africa/Lagos default.
    }
  }, []);

  const estateFields = () => ({
    estateName: estateName.trim(),
    address: address.trim(),
    city: city.trim(),
    state: state.trim(),
    country: country.trim(),
    timezone,
    contactPhone: contactPhone.trim() || undefined,
  });

  function estateError(): string | null {
    if (estateName.trim().length < 2) return 'Enter the estate name.';
    if (address.trim().length < 3) return 'Enter the estate address.';
    if (!city.trim() || !state.trim() || !country.trim()) return 'Enter the city, state and country.';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const problem = estateError();
    if (problem) return setFormError(problem);
    if (adminName.trim().length < 2) return setFormError('Enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFormError('Enter a valid email address.');
    if (password.length < 10) return setFormError('Choose a password with at least 10 characters.');
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return setFormError('Your password needs at least one letter and one number.');
    }
    if (password !== confirmPassword) return setFormError('Passwords don\u2019t match.');

    setSubmitting(true);
    try {
      await apiFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({
          ...estateFields(),
          adminName: adminName.trim(),
          email: email.trim(),
          adminPhone: adminPhone.trim() || undefined,
          password,
        }),
      });
      setSentTo(email.trim().toLowerCase());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit your signup. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-10">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
        <img src="/brand/entryva-mark.png" alt="Entryva" className="h-14 w-14 rounded-2xl shadow-glow" />
        <h1 className="font-display text-2xl font-bold text-ink">Register your estate</h1>
        <p className="max-w-sm text-sm text-ink-400">
          Create your estate on Entryva, then add buildings, apartments, residents and security officers.
        </p>
      </div>

      {sentTo ? (
        <div className="glass-card w-full max-w-md rounded-2xl p-8 text-center">
          <p className="mb-2 text-lg font-semibold text-ink">Check your email</p>
          <p className="text-ink-400">
            If <span className="font-medium text-ink">{sentTo}</span> can be registered, we&rsquo;ve sent a
            confirmation link. Open it to activate your estate and sign in. The link works once and expires in 24
            hours.
          </p>
          <p className="mt-4 text-sm text-ink-400">
            Nothing arrived after a few minutes? Check spam, then submit the form again.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="glass-card flex w-full max-w-md flex-col gap-4 rounded-2xl p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Your estate</p>
          <Field
            label="Estate name"
            placeholder="e.g. Sunset Gardens Estate"
            value={estateName}
            onChange={(e) => setEstateName(e.target.value)}
            autoFocus
          />
          <Field
            label="Address"
            placeholder="Street and area"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <Field label="State / region" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <Field label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="timezone" className="text-[13px] font-medium text-ink-400">
              Timezone
            </label>
            <select id="timezone" className={selectClasses} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z} className="bg-[#0B1220]">
                  {z}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-400">Visitor pass times are calculated in this timezone.</p>
          </div>
          <Field
            label="Estate office phone (optional)"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />

          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-400">You (estate admin)</p>

          <Field label="Full name" value={adminName} onChange={(e) => setAdminName(e.target.value)} autoComplete="name" />
          <Field
            label="Email"
            type="email"
            placeholder="you@estate.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <Field
            label="Your phone (optional)"
            type="tel"
            value={adminPhone}
            onChange={(e) => setAdminPhone(e.target.value)}
            autoComplete="tel"
          />
          <Field
            label="Password"
            type="password"
            placeholder="At least 10 characters, with a number"
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
            {submitting ? 'Sending confirmation\u2026' : 'Create estate'}
          </Button>
          <p className="text-center text-sm text-ink-400">
            Already registered?{' '}
            <Link href="/login" className="text-brass underline">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </main>
  );
}
