'use client';

// Estate admin: rules for extending visitor passes. Open at /estate/pass-rules.

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { TimeField } from '@/components/ui/TimeField';
import { apiFetch } from '@/lib/api-client';
import { hhmmToMinutes, minutesToHHMM } from '@/lib/time-of-day';

interface PassRules {
  enabled: boolean;
  maxExtendMinutes: number;
  maxTotalMinutes: number;
  quietFromMinute: number | null;
  quietToMinute: number | null;
  timeZone: string;
}

export default function PassRulesPage() {
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [maxExtend, setMaxExtend] = useState('120');
  const [maxTotalHours, setMaxTotalHours] = useState('12');
  const [quietOn, setQuietOn] = useState(false);
  const [quietFrom, setQuietFrom] = useState('22:00');
  const [quietTo, setQuietTo] = useState('05:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function apply(rules: PassRules) {
    setTimeZone(rules.timeZone);
    setEnabled(rules.enabled);
    setMaxExtend(String(rules.maxExtendMinutes));
    setMaxTotalHours(String(Math.round(rules.maxTotalMinutes / 60)));
    const hasQuiet = rules.quietFromMinute !== null && rules.quietToMinute !== null;
    setQuietOn(hasQuiet);
    if (hasQuiet) {
      setQuietFrom(minutesToHHMM(rules.quietFromMinute as number));
      setQuietTo(minutesToHHMM(rules.quietToMinute as number));
    }
  }

  useEffect(() => {
    let cancelled = false;
    apiFetch<PassRules>('/admin/estate/pass-rules')
      .then((rules) => {
        if (!cancelled) apply(rules);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the pass rules.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const ext = Number(maxExtend);
    const hours = Number(maxTotalHours);
    if (!Number.isInteger(ext) || ext < 5 || ext > 720) {
      setError('The longest single extension must be between 5 and 720 minutes.');
      return;
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 48) {
      setError('The longest total pass length must be between 1 and 48 hours.');
      return;
    }
    if (hours * 60 < ext) {
      setError('The total pass length must be at least as long as one extension.');
      return;
    }
    let from: number | null = null;
    let to: number | null = null;
    if (quietOn) {
      from = hhmmToMinutes(quietFrom);
      to = hhmmToMinutes(quietTo);
      if (from === null || to === null || from === to) {
        setError('Choose two different quiet-hours times.');
        return;
      }
    }

    setSaving(true);
    try {
      const rules = await apiFetch<PassRules>('/admin/estate/pass-rules', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          maxExtendMinutes: ext,
          maxTotalMinutes: hours * 60,
          quietFromMinute: from,
          quietToMinute: to,
        }),
      });
      apply(rules);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the pass rules.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <header>
        <Link href="/estate" className="text-sm text-brass underline">
          &larr; Estate
        </Link>
        <h1 className="mt-2 font-display text-[32px] font-bold text-ink">Pass extension rules</h1>
        <p className="text-[15px] text-ink-400">
          Residents can extend their own visitor passes. These rules decide how far and when.
        </p>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-card bg-white/[0.04]" />
      ) : (
        <form onSubmit={handleSubmit} className="glass-card flex flex-col gap-5 rounded-card p-6">
          <label className="flex items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-5 w-5 accent-[#5DA8FF]"
            />
            Allow residents to extend passes
          </label>

          <Field
            label="Longest single extension (minutes)"
            type="number"
            inputMode="numeric"
            min={5}
            max={720}
            value={maxExtend}
            onChange={(e) => setMaxExtend(e.target.value)}
            hint="For example 120 lets a resident add up to 2 hours at a time."
          />
          <Field
            label="Longest a pass can last in total (hours)"
            type="number"
            inputMode="numeric"
            min={1}
            max={48}
            value={maxTotalHours}
            onChange={(e) => setMaxTotalHours(e.target.value)}
            hint="Counted from the start of the visit window, however many times it is extended."
          />

          <div className="h-px bg-ink-100" />

          <label className="flex items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={quietOn}
              onChange={(e) => setQuietOn(e.target.checked)}
              className="h-5 w-5 accent-[#5DA8FF]"
            />
            No extensions during quiet hours
          </label>
          {quietOn && (
            <div className="grid grid-cols-2 gap-4">
              <TimeField label="From" value={quietFrom} onChange={setQuietFrom} />
              <TimeField label="Until" value={quietTo} onChange={setQuietTo} />
            </div>
          )}
          {quietOn && (
            <p className="-mt-2 text-xs text-ink-400">
              A pass can&rsquo;t be extended during these hours, or into them. Times use your estate&rsquo;s time zone
              ({timeZone}).
              {timeZone === 'UTC' && ' Your estate is still on UTC; set it to Africa/Lagos so these match local time.'}
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50 px-4 py-3 text-sm text-alert">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-2xl bg-verified-50 px-4 py-3 text-sm text-verified">
              Saved. The new rules apply to the next extension.
            </p>
          )}

          <Button type="submit" fullWidth disabled={saving}>
            {saving ? 'Saving\u2026' : 'Save rules'}
          </Button>
        </form>
      )}
    </main>
  );
}
