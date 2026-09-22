'use client';

// Resident app shell — Dark Luxury Glassmorphism.
//
// Two nav surfaces for one route table, chosen with CSS breakpoints alone
// (no client-side viewport detection, so this is SSR-safe and never
// flashes the wrong layout):
//   - lg+   a persistent glass sidebar (Tesla app / Linear-style rail)
//   - below a fixed floating glass dock, thumb-reachable at the bottom,
//     with "Create" as an elevated center action per the design system.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { HomeIcon, VisitorsIcon, PlusIcon } from '@/components/ui/icons';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: HomeIcon },
  { href: '/visitors/new', label: 'Create', icon: PlusIcon },
  { href: '/visitors/history', label: 'Visitors', icon: VisitorsIcon },
];

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname?.startsWith(href);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-1 border-r border-ink-100 bg-black/40 px-4 py-6 backdrop-blur-glass lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
          <img src="/brand/entryva-mark.png" alt="" className="h-9 w-9 rounded-xl shadow-glow" />
          <div className="leading-tight">
            {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
            <img src="/brand/entryva-logo-full.png" alt="Entryva" className="h-4 w-auto" />
            <p className="mt-1 text-[11px] text-ink-400">Resident Portal</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-all duration-150 ease-premium ${
                  active
                    ? 'glass-surface text-ink shadow-card'
                    : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink'
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${active ? 'text-brass' : ''}`} />
                {item.label === 'Create' ? 'Invite Visitor' : item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-ink-100 pt-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-medium text-ink-400">Alerts</span>
            <NotificationBell />
          </div>
          <LogoutButton className="px-2" />
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-black/40 px-5 py-4 backdrop-blur-glass lg:hidden">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
          <img src="/brand/entryva-mark.png" alt="" className="h-8 w-8 rounded-lg" />
          {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
          <img src="/brand/entryva-logo-full.png" alt="Entryva" className="h-4 w-auto" />
        </span>
        <div className="flex items-center gap-1">
          <NotificationBell />
        </div>
      </header>

      <div className="lg:pl-64">
        <div className="pb-28 lg:pb-10">{children}</div>
      </div>

      {/* Mobile floating glass dock */}
      <nav className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-6 lg:hidden">
        <div className="flex items-center gap-1 rounded-pill border border-ink-100 bg-[rgba(20,20,20,0.85)] px-2 py-2 shadow-card backdrop-blur-dock">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            if (item.href === '/visitors/new') {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label="Invite visitor"
                  className="mx-1 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-brass to-[#3B82F6] text-white shadow-floating transition-transform duration-150 ease-premium active:scale-90"
                >
                  <Icon className="h-6 w-6" />
                </Link>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-full px-5 py-2 text-[11px] font-medium transition-colors duration-150 ease-premium ${
                  active ? 'text-brass' : 'text-ink-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <LogoutButton className="px-4 !text-[11px]" />
        </div>
      </nav>
    </div>
  );
}
