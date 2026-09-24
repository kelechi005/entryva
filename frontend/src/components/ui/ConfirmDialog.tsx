'use client';

// Plain yes/no confirmation dialog — same visual language as
// ConfirmPasswordDialog (glass card over a dimmed backdrop, click-outside
// to cancel) but for actions that just need "are you sure?" rather than
// step-up password auth. First use: LogoutButton, so a stray tap on
// "Sign out" can't end a session the officer/resident didn't mean to end.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  variant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Escape closes it, same as clicking outside — a confirmation dialog
  // shouldn't be harder to back out of than it is to open.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Rendered via a portal into document.body, not inline where the
  // button lives. On the mobile security layout, LogoutButton sits
  // inside the floating dock — a div with backdrop-blur applied, which
  // (like `filter`) establishes a new containing block for any
  // `position: fixed` descendant. Without the portal, this dialog's
  // `fixed inset-0` was resolving against that small pill-shaped dock,
  // not the viewport, so it rendered squashed into the bottom corner
  // instead of centered over the whole screen — exactly the "not
  // positioned well on mobile" bug. Escaping to document.body sidesteps
  // that regardless of which ancestor (dock, sidebar, anything added
  // later) the trigger button happens to be nested inside.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-ink-100 glass-card p-6 flex flex-col gap-5">
        <div>
          <h2 id="confirm-dialog-title" className="font-display text-lg text-ink">
            {title}
          </h2>
          <p id="confirm-dialog-description" className="mt-1 text-sm text-ink-400">
            {description}
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Please wait\u2026' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
