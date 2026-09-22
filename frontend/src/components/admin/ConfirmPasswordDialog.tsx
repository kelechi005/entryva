'use client';

// Step-up-auth confirmation dialog for destructive admin actions
// (removing a resident or security officer). The password is checked
// server-side (AdministrationService.assertActingAdminPassword) — this
// dialog only collects it; it never decides on its own whether the
// action is allowed.

import { FormEvent, useEffect, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

interface ConfirmPasswordDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

export function ConfirmPasswordDialog({
  open,
  title,
  description,
  confirmLabel = 'Remove',
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmPasswordDialogProps) {
  const [password, setPassword] = useState('');

  // Clear whatever was typed once the dialog closes, so a stray
  // password never lingers in state for the next thing it's opened for.
  useEffect(() => {
    if (!open) setPassword('');
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    onConfirm(password);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-ink-100 glass-card p-6 flex flex-col gap-4"
      >
        <div>
          <h2 id="confirm-password-title" className="font-display text-lg text-ink">
            {title}
          </h2>
          <p className="mt-1 text-sm text-ink-400">{description}</p>
        </div>

        <Field
          label="Your password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !password}>
            {busy ? 'Removing\u2026' : confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
