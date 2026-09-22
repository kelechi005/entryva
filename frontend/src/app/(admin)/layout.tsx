'use client';

// Shared shell for the admin experience. A dark rail against the dark
// workspace (see design/RESIDENT_PORTAL_DESIGN_SYSTEM.md — "dark luxury
// glassmorphism" everywhere, not a light "admin panel" split) collapses
// into a slide-in drawer under lg, with a sticky glass top bar carrying
// the menu trigger, so the whole admin portal stays usable on a phone.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogoutButton } from '@/components/ui/LogoutButton';
import {
  HomeIcon,
  BuildingIcon,
  UserIcon,
  ShieldIcon,
  ClockIcon,
  MenuIcon,
  XIcon,
} from '@/components/ui/icons';

const NAV_ITEMS = [
  { href: '/estate', label: 'Dashboard', icon: HomeIcon },
  { href: '/properties', label: 'Buildings & Apartments', icon: BuildingIcon },
  { href: '/residents', label: 'Residents', icon: UserIcon },
  { href: '/security-officers', label: 'Security Officers', icon: ShieldIcon },
  { href: '/audit-logs', label: 'Audit Logs', icon: ClockIcon },
];

function Logo() {
  return (
    <div className="flex items-center gap-2 px-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
      <img src="/brand/entryva-mark.png" alt="" className="h-8 w-8 rounded-lg" />
      {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
      <img src="/brand/entryva-logo-full.png" alt="Entryva" className="h-4 w-auto" />
    </div>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-premium ${
              active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer automatically whenever navigation happens (including
  // browser back/forward), so it never lingers open over the new page.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer overlay is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // If the viewport grows into the desktop rail breakpoint while the
  // mobile drawer happens to be open, close it — the rail takes over and
  // a hidden-but-still-"open" drawer would otherwise leave scroll locked.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setDrawerOpen(false);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const activeLabel = NAV_ITEMS.find((item) => pathname?.startsWith(item.href))?.label ?? 'Admin';

  return (
    <div className="min-h-screen ambient-glow lg:flex">
      {/* Desktop rail */}
      <aside className="hidden w-64 shrink-0 flex-col gap-1 border-r border-ink-100 bg-black/40 px-4 py-6 backdrop-blur-glass lg:flex">
        <div className="mb-6">
          <Logo />
        </div>
        <NavLinks pathname={pathname} />
        <div className="mt-auto flex items-center justify-between px-2 pt-4">
          <span className="text-xs text-ink-400">Estate Admin</span>
          <LogoutButton className="text-white/60 hover:text-white" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-black/60 px-4 py-3.5 backdrop-blur-glass lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/5 hover:text-white"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <span className="font-display text-sm font-semibold text-ink">{activeLabel}</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
        <img src="/brand/entryva-mark.png" alt="" className="h-7 w-7 rounded-lg" />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside className="animate-fade-up absolute left-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-1 border-r border-ink-100 bg-[#0A0A0A] px-4 py-6 shadow-card">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/5 hover:text-white"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            <div className="mt-auto flex items-center justify-between px-2 pt-4">
              <span className="text-xs text-ink-400">Estate Admin</span>
              <LogoutButton className="text-white/60 hover:text-white" />
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
