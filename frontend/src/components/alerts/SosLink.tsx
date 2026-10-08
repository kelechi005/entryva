'use client';

// A red "SOS" shortcut in the resident's menus: one tap to the emergency
// screen. (Pressing it does NOT send anything - the alert is only sent
// after choosing a kind and confirming on that screen.)

import Link from 'next/link';
import { AlertIcon } from '@/components/ui/icons';

export function SosLink({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Link
        href="/alerts?tab=emergencies"
        aria-label="Emergency"
        className="flex h-10 items-center gap-1.5 rounded-full bg-alert px-3.5 text-xs font-bold text-white shadow-[0_6px_20px_rgba(239,68,68,0.4)]"
      >
        <AlertIcon className="h-4 w-4" /> SOS
      </Link>
    );
  }
  return (
    <Link
      href="/alerts?tab=emergencies"
      className="flex items-center justify-center gap-2 rounded-2xl bg-alert px-4 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(239,68,68,0.35)] hover:brightness-110"
    >
      <AlertIcon className="h-4 w-4" /> Emergency SOS
    </Link>
  );
}
