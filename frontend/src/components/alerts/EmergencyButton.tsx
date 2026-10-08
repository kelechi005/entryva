'use client';

// The resident's emergency button. Two steps on purpose (press, then
// choose what kind and confirm) so a stray tap in a pocket never sounds an
// alarm for the whole estate - but only two, because in a real emergency it
// has to be fast.

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertIcon, CheckCircleIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import { EMERGENCY_KINDS } from '@/lib/alerts';
import type { EmergencyKind, RaiseEmergencyResult } from '@/types/alerts';

interface Props {
  onRaised: (result: RaiseEmergencyResult) => void;
}

export function EmergencyButton({ onRaised }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EmergencyKind | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RaiseEmergencyResult | null>(null);

  function close() {
    setOpen(false);
    setKind(null);
    setNote('');
    setError(null);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!kind) return setError('Choose what kind of emergency this is.');
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<RaiseEmergencyResult>('/emergency-alerts', {
        method: 'POST',
        body: JSON.stringify({ kind, note: note.trim() || undefined }),
      });
      setResult(res);
      onRaised(res);
      close();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} If it is urgent, call your estate security or 112 now.`
          : 'Could not send the alert. If it is urgent, call your estate security or 112 now.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {result && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${
            result.notifiedCount === 0 && !result.duplicate ? 'bg-warn-50 text-warn' : 'bg-verified-50 text-verified'
          }`}
        >
          {result.notifiedCount === 0 && !result.duplicate ? (
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <p>
            {result.duplicate
              ? 'You already sent this alert a moment ago. Security has it.'
              : result.notifiedCount === 0
                ? 'Your alert was saved, but no security officer could be notified. Call your estate security or 112 right now.'
                : 'Security has been alerted. Stay safe, help is being sent.'}
          </p>
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setOpen(true);
          }}
          className="flex w-full items-center justify-center gap-3 rounded-3xl bg-alert px-6 py-6 font-display text-xl font-bold text-white shadow-[0_12px_40px_rgba(239,68,68,0.45)] transition-transform active:scale-[0.98]"
        >
          <AlertIcon className="h-7 w-7" /> Emergency
        </button>
      ) : (
        <form onSubmit={send} className="glass-card flex flex-col gap-4 rounded-card border border-alert/40 p-5">
          <div>
            <p className="font-display text-lg font-semibold text-ink">What is happening?</p>
            <p className="text-sm text-ink-400">
              This alerts your estate security and admin straight away. For anything life-threatening, also call 112.
            </p>
          </div>

          <div role="radiogroup" aria-label="Kind of emergency" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EMERGENCY_KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={kind === k.kind}
                onClick={() => setKind(k.kind)}
                className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                  kind === k.kind ? 'border-alert bg-alert-50 text-ink' : 'border-ink-100 text-ink hover:bg-white/[0.04]'
                }`}
              >
                <span className="block text-sm font-semibold">{k.label}</span>
                <span className="block text-xs text-ink-400">{k.hint}</span>
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-400">Add a short note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="e.g. Smoke in the kitchen"
              className="w-full rounded-2xl border border-ink-100 bg-white/[0.03] px-4 py-3 text-[15px] text-ink placeholder:text-ink-400/70 focus:border-brass/60 focus:outline-none focus:ring-2 focus:ring-brass/40 [color-scheme:dark]"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={sending || !kind}>
              {sending ? 'Sending\u2026' : 'Send emergency alert'}
            </Button>
            <Button type="button" variant="ghost" onClick={close} disabled={sending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
