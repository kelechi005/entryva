'use client';

// Profile menu: a round avatar button that opens a small menu with the
// signed-in person's name and Sign out. It keeps Sign out out of the main
// navigation so it can't be tapped by accident.

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { UserIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import type { AuthenticatedUser } from '@/types/auth';

// The phone and desktop layouts each mount one menu; share a single request.
let mePromise: Promise<AuthenticatedUser> | null = null;
function loadMe(): Promise<AuthenticatedUser> {
  if (!mePromise) {
    mePromise = apiFetch<AuthenticatedUser>('/auth/me').catch((err) => {
      mePromise = null;
      throw err;
    });
  }
  return mePromise;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface Props {
  /** Which way the menu opens. The desktop sidebar sits at the bottom, so it opens up. */
  placement?: 'down' | 'up';
  /** Small line under the name, e.g. "Resident". */
  subtitle?: string;
  /** Avatar only (phone top bar). Otherwise avatar plus name. */
  compact?: boolean;
}

export function ProfileMenu({ placement = 'down', subtitle, compact = false }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Once Sign out is tapped, its confirm dialog may sit outside this menu.
  // Clicks in that dialog must not close the menu (which would remove it).
  const signOutTapped = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadMe()
      .then((me) => {
        if (!cancelled) setName(me.displayName);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Moving to another page closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      signOutTapped.current = false;
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (signOutTapped.current) return;
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initials = name ? initialsOf(name) : '';
  const avatar = (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-sm font-semibold text-ink">
      {initials || <UserIcon className="h-4 w-4" />}
    </span>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profile menu"
        onClick={() => {
          signOutTapped.current = false;
          setOpen((v) => !v);
        }}
        className={
          compact
            ? 'flex items-center rounded-full p-0.5 transition-colors duration-150 ease-premium hover:bg-white/[0.06]'
            : 'flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors duration-150 ease-premium hover:bg-white/[0.05]'
        }
      >
        {avatar}
        {!compact && (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-ink">{name ?? 'Your profile'}</span>
            {subtitle && <span className="block text-[11px] text-ink-400">{subtitle}</span>}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-56 rounded-2xl border border-ink-100 bg-[#141414] p-2 shadow-card ${
            placement === 'up' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'
          }`}
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{name ?? 'Your profile'}</p>
            {subtitle && <p className="text-xs text-ink-400">{subtitle}</p>}
          </div>
          <div className="my-1 border-t border-ink-100" />
          <div
            role="none"
            onClickCapture={() => {
              signOutTapped.current = true;
            }}
          >
            <LogoutButton className="w-full rounded-xl px-3 py-2.5 text-left" />
          </div>
        </div>
      )}
    </div>
  );
}
