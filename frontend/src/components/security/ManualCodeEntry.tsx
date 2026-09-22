'use client';

import { FormEvent, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { KeypadIcon } from '@/components/ui/icons';

interface ManualCodeEntryProps {
  onSubmit: (code: string) => Promise<void>;
  cameraUnavailableNotice?: boolean;
}

export function ManualCodeEntry({ onSubmit, cameraUnavailableNotice }: ManualCodeEntryProps) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError('Enter the visitor code.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify that code.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-5 rounded-[32px] border border-ink-100 glass-card px-7 py-9"
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-brass">
          <KeypadIcon className="h-6 w-6" />
        </span>
        <p className="text-sm text-ink-400">Type the code shown on the visitor&rsquo;s pass.</p>
      </div>

      {cameraUnavailableNotice && (
        <p className="rounded-2xl bg-brass-50 px-4 py-3 text-sm text-brass">
          Camera access unavailable. Enter the visitor code manually.
        </p>
      )}
      <Field
        label="Visitor code"
        placeholder="e.g. 7XK92P"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        error={error ?? undefined}
        autoComplete="off"
        autoFocus
        className="text-center text-lg tracking-[0.3em]"
      />
      <Button type="submit" fullWidth disabled={submitting}>
        {submitting ? 'Verifying\u2026' : 'Verify code'}
      </Button>
    </form>
  );
}
