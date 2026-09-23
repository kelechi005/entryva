'use client';

// Shared across all three layouts — there was previously no way to log
// out of the app at all (POST /auth/logout existed on the backend but
// nothing on the frontend ever called it). Kept intentionally tiny: a
// text-style button rather than a full account menu, since none of the
// mockups this project was built against specced anything richer.
//
// A confirmation step was added on top of that: this button sits right
// next to normal nav items in both the sidebar and the mobile dock (see
// the security/resident/admin layouts), so a mis-tap ending the session
// entirely — especially for a security officer mid-shift — is a real
// risk without one.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logout } from '@/lib/auth';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export function LogoutButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleConfirm() {
    setLoggingOut(true);
    await logout(router);
    // No need to reset loggingOut/confirmOpen on success — logout()
    // navigates away, unmounting this component.
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={`text-sm font-medium text-ink-400 transition-colors duration-150 ease-premium hover:text-alert disabled:opacity-50 ${className}`}
      >
        Sign out
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Sign out?"
        description="You'll need to sign in again to continue."
        confirmLabel="Sign out"
        variant="danger"
        busy={loggingOut}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
