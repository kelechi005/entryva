'use client';

// Shared across all three layouts — there was previously no way to log
// out of the app at all (POST /auth/logout existed on the backend but
// nothing on the frontend ever called it). Kept intentionally tiny: a
// text-style button rather than a full account menu, since none of the
// mockups this project was built against specced anything richer.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logout } from '@/lib/auth';

export function LogoutButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleClick() {
    setLoggingOut(true);
    await logout(router);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loggingOut}
      className={`text-sm font-medium text-ink-400 transition-colors duration-150 ease-premium hover:text-alert disabled:opacity-50 ${className}`}
    >
      {loggingOut ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
