'use client';

// Resident: regular visitors (house help, drivers, cleaners, regular deliveries).
// One pass covers set weekdays and hours. Open at /recurring.

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { TimeField } from '@/components/ui/TimeField';
import { apiFetch } from '@/lib/api-client';
import { hhmmToMinutes, minutesToHHMM } from '@/lib/time-of-day';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  WEEKDAY_ORDER,
  addDaysKey,
  formatDateKey,
  formatDays,
  formatWindow,
  localDateKey,
  passLink,
  passWhatsAppUrl,
  weekdayLabel,
} from '@/lib/recurring-pass';
import type {
  CreatedRecurringPass,
  PassScanRecord,
  RecurringPassView,
  RecurringRole,
} from '@/types/recurring-pass';

const ROLES = Object.keys(ROLE_LABELS) as RecurringRole[];

function CreateForm({ onCreated, onCancel }: { onCreated: (p: CreatedRecurringPass) => void; onCancel: () => void }) {
  const today = localDateKey();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<RecurringRole>('HOUSE_HELP');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [validFrom, setValidFrom] = useState(today);
  const [validUntil, setValidUntil] = useState(addDaysKey(today, 29));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const startMinute = hhmmToMinutes(start);
    const endMinute = hhmmToMinutes(end);
    if (fullName.trim().length < 2) return setError('Enter their name.');
    if (days.length === 0) return setError('Choose at least one weekday.');
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      return setError('The end time must be after the start time.');
    }
    setBusy(true);
    try {
      const created = await apiFetch<CreatedRecurringPass>('/recurring-passes', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          role,
          days,
          startMinute,
          endMinute,
          validFrom,
          validUntil,
        }),
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the pass.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass-card flex flex-col gap-5 rounded-card p-6">
      <h2 className="font-display text-xl font-semibold text-ink">New regular visitor</h2>
      <Field label="Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <Field
        label="Phone (optional)"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        hint="Used to send them the pass on WhatsApp."
      />
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-400">
        Who are they?
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RecurringRole)}
          className="w-full rounded-2xl border border-ink-100 bg-white/[0.03] px-4 py-3 text-base text-ink"
        >
          {ROLES.map((r) => (
            <option key={r} value={r} className="text-black">
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-ink-400">Days they can come</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days.includes(d)}
              onClick={() => toggleDay(d)}
              className={`rounded-pill border px-4 py-2 text-sm font-medium transition-colors duration-150 ease-premium ${
                days.includes(d) ? 'border-brass/60 bg-brass/10 text-ink' : 'border-ink-100 text-ink-400 hover:text-ink'
              }`}
            >
              {weekdayLabel(d)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TimeField label="From" value={start} onChange={setStart} />
        <TimeField label="Until" value={end} onChange={setEnd} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Pass starts" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        <Field label="Pass ends" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </div>
      <p className="-mt-2 text-xs text-ink-400">A pass lasts at most 90 days. You can renew it any time.</p>

      {error && (
        <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="button" variant="ghost" fullWidth onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? 'Creating\u2026' : 'Create pass'}
        </Button>
      </div>
    </form>
  );
}

function ShareCard({ created, residentName, onDone }: { created: CreatedRecurringPass; residentName?: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = passLink(window.location.origin, created.shareToken);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="glass-card flex flex-col gap-4 rounded-card p-6">
      <h2 className="font-display text-xl font-semibold text-ink">Pass ready for {created.fullName}</h2>
      <p className="text-sm text-ink-400">
        Send them this link now. For safety it is shown only once, so if you lose it, revoke this pass and make a new
        one. It opens on one phone only: the first phone that opens it.
      </p>
      <p className="break-all rounded-2xl border border-ink-100 bg-white/[0.03] px-4 py-3 text-sm text-ink">{link}</p>
      <a
        href={passWhatsAppUrl({ name: created.fullName, phone: created.phone, link, residentName })}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-[54px] w-full items-center justify-center rounded-2xl bg-[#25D366] text-base font-semibold text-black"
      >
        Send on WhatsApp
      </a>
      <Button variant="secondary" fullWidth onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <Button variant="ghost" fullWidth onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function PassCard({ pass, reload }: { pass: RecurringPassView; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [panel, setPanel] = useState<'skip' | 'extra' | 'history' | null>(null);
  const [date, setDate] = useState(localDateKey());
  const [history, setHistory] = useState<PassScanRecord[] | null>(null);

  const live = pass.status === 'ACTIVE' || pass.status === 'PAUSED';

  async function run(path: string, init: { method: string; body?: unknown } = { method: 'POST' }, message?: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await apiFetch(path, {
        method: init.method,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      if (message) setNote(message);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function openHistory() {
    setPanel(panel === 'history' ? null : 'history');
    if (history === null) {
      try {
        setHistory(await apiFetch<PassScanRecord[]>(`/recurring-passes/${pass.id}/history`));
      } catch {
        setHistory([]);
      }
    }
  }

  const statusTone =
    pass.status === 'ACTIVE' ? 'bg-verified-50 text-verified' : pass.status === 'PAUSED' ? 'bg-brass-50 text-brass' : 'bg-alert-50 text-alert';

  return (
    <li className="glass-card flex flex-col gap-4 rounded-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{pass.fullName}</p>
          <p className="text-sm text-ink-400">{ROLE_LABELS[pass.role]}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {pass.inside && (
            <span className="rounded-pill bg-white/[0.08] px-2.5 py-0.5 text-xs font-medium text-ink">Inside now</span>
          )}
          <span className={`rounded-pill px-2.5 py-0.5 text-xs font-medium ${statusTone}`}>{STATUS_LABELS[pass.status]}</span>
        </div>
      </div>

      <div className="text-sm text-ink-400">
        <p>
          {formatDays(pass.days)}, {formatWindow(pass.startMinute, pass.endMinute)}
        </p>
        <p>
          {formatDateKey(pass.validFrom)} to {formatDateKey(pass.validUntil)}
        </p>
      </div>

      {pass.upcomingExceptions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {pass.upcomingExceptions.map((e) => (
            <li key={e.date} className="flex items-center gap-1.5 rounded-pill bg-white/[0.06] px-3 py-1 text-xs text-ink">
              {e.type === 'SKIP' ? 'Skip' : 'Extra'} {formatDateKey(e.date)}
              {e.type === 'EXTRA' && e.startMinute !== null && e.endMinute !== null
                ? `, ${minutesToHHMM(e.startMinute)} to ${minutesToHHMM(e.endMinute)}`
                : ''}
              <button
                type="button"
                aria-label={`Remove ${e.type === 'SKIP' ? 'skip' : 'extra day'} on ${e.date}`}
                disabled={busy}
                onClick={() => void run(`/recurring-passes/${pass.id}/exceptions/${e.date}`, { method: 'DELETE' })}
                className="text-ink-400 hover:text-ink"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {live && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-brass">
          {pass.status === 'ACTIVE' ? (
            <button type="button" disabled={busy} onClick={() => void run(`/recurring-passes/${pass.id}/pause`)} className="hover:underline">
              Pause
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void run(`/recurring-passes/${pass.id}/resume`)} className="hover:underline">
              Resume
            </button>
          )}
          <button type="button" onClick={() => setPanel(panel === 'skip' ? null : 'skip')} className="hover:underline">
            Skip a day
          </button>
          <button type="button" onClick={() => setPanel(panel === 'extra' ? null : 'extra')} className="hover:underline">
            Add a day
          </button>
          <button type="button" onClick={() => void openHistory()} className="hover:underline">
            Activity
          </button>
        </div>
      )}
      {pass.status !== 'REVOKED' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-ink-400">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(`/recurring-passes/${pass.id}/renew`, { method: 'POST', body: { days: 30 } }, 'Renewed for 30 days from today.')}
            className="hover:text-ink hover:underline"
          >
            Renew 30 days
          </button>
          {pass.phoneLinked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(`/recurring-passes/${pass.id}/reset-phone`, { method: 'POST' }, 'They can now open the pass on a new phone.')}
              className="hover:text-ink hover:underline"
            >
              Allow a new phone
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Revoke ${pass.fullName}'s pass? This cannot be undone.`)) {
                void run(`/recurring-passes/${pass.id}/revoke`);
              }
            }}
            className="text-alert hover:underline"
          >
            Revoke
          </button>
        </div>
      )}

      {(panel === 'skip' || panel === 'extra') && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={panel === 'skip' ? 'Day to skip' : 'Extra day'} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button
            variant="secondary"
            disabled={busy || !date}
            onClick={() => {
              void run(
                `/recurring-passes/${pass.id}/${panel === 'skip' ? 'skip' : 'extra'}`,
                { method: 'POST', body: { date } },
                panel === 'skip' ? 'That day is skipped.' : 'That day is added, using the usual hours.',
              );
              setPanel(null);
            }}
          >
            Save
          </Button>
        </div>
      )}

      {panel === 'history' && (
        <div className="flex flex-col gap-1.5 text-sm text-ink-400">
          {history === null && <p>Loading&hellip;</p>}
          {history !== null && history.length === 0 && <p>No scans yet.</p>}
          {history?.map((s) => (
            <p key={s.id}>
              {formatDateKey(s.localDate)}, {new Date(s.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}:{' '}
              {s.result === 'ALLOWED' ? (s.direction === 'OUT' ? 'Went out' : 'Came in') : `Refused${s.reason ? ` (${s.reason.toLowerCase().replace(/_/g, ' ')})` : ''}`}
            </p>
          ))}
        </div>
      )}

      {note && (
        <p role="status" className="text-sm text-verified">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
    </li>
  );
}

export default function RecurringPassesPage() {
  const [passes, setPasses] = useState<RecurringPassView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<CreatedRecurringPass | null>(null);

  const load = useCallback(async () => {
    try {
      setPasses(await apiFetch<RecurringPassView[]>('/recurring-passes'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your regular visitors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-ink">Regular visitors</h1>
          <p className="text-[15px] text-ink-400">House help, drivers and cleaners who come on set days.</p>
        </div>
        {!showForm && !created && <Button onClick={() => setShowForm(true)}>Add</Button>}
      </header>

      {error && (
        <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}

      {created && (
        <ShareCard
          created={created}
          onDone={() => {
            setCreated(null);
            void load();
          }}
        />
      )}

      {showForm && !created && (
        <CreateForm
          onCancel={() => setShowForm(false)}
          onCreated={(p) => {
            setShowForm(false);
            setCreated(p);
            void load();
          }}
        />
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-card bg-white/[0.04]" />
      ) : passes.length === 0 && !showForm && !created ? (
        <div className="rounded-card border border-dashed border-ink-100 px-6 py-10 text-center">
          <p className="text-ink-400">No regular visitors yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {passes.map((p) => (
            <PassCard key={p.id} pass={p} reload={load} />
          ))}
        </ul>
      )}
    </main>
  );
}
