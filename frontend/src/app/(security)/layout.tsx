'use client';

// Shell for the security experience — restyled to match the resident
// portal's Dark Luxury Glassmorphism shell (CLAUDE.md design system):
//   - lg+   a persistent glass sidebar, mirroring the officer desktop
//     mockup (brand, nav rail, presence + sign-out footer)
//   - below a fixed floating glass dock, thumb-reachable, mirroring the
//     officer mobile mockup's bottom navigation.
// Same two routes as before (Gate, History) and the same CallProvider /
// CallOverlay wiring — this pass only changes how it looks.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { CallProvider } from '@/lib/calls/CallProvider';
import { CallOverlay } from '@/components/security/CallOverlay';
import { ShieldIcon, ClockIcon, PhoneIcon } from '@/components/ui/icons';
import { CallUnreadBadge } from '@/components/security/CallUnreadBadge';

const NAV_ITEMS = [
  { href: '/gate', label: 'Gate', icon: ShieldIcon },
  { href: '/history', label: 'History', icon: ClockIcon },
];

// Call is mobile-only (see /call/page.tsx for why), so it's a separate
// list rather than a third NAV_ITEMS entry — the desktop sidebar below
// maps NAV_ITEMS only, the mobile dock maps MOBILE_NAV_ITEMS.
const MOBILE_NAV_ITEMS = [...NAV_ITEMS, { href: '/call', label: 'Call', icon: PhoneIcon }];

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname?.startsWith(href);

  return (
    <CallProvider>
      <div className="min-h-screen ambient-glow">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-1 border-r border-ink-100 bg-black/40 px-4 py-6 backdrop-blur-glass lg:flex">
          <div className="mb-8 flex items-center gap-2.5 px-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
            <img src="/brand/entryva-mark.png" alt="" className="h-9 w-9 rounded-xl shadow-glow" />
            <div className="leading-tight">
              {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
              <img src="/brand/entryva-logo-full.png" alt="Entryva" className="h-4 w-auto" />
              <p className="mt-1 text-[11px] text-ink-400">Security Console</p>
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
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-3 border-t border-ink-100 pt-4">
            <LogoutButton className="px-2" />
          </div>
        </aside>

        {/* Mobile / tablet top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-ink-100 bg-black/40 px-5 py-4 backdrop-blur-glass lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
          <img src="/brand/entryva-mark.png" alt="" className="h-8 w-8 rounded-lg" />
          {/* eslint-disable-next-line @next/next/no-img-element -- small local asset */}
          <img src="/brand/entryva-logo-full.png" alt="Entryva" className="h-4 w-auto" />
        </header>

        <div className="lg:pl-64">
          <div className="pb-28 lg:pb-10">{children}</div>
        </div>

        {/* Mobile floating glass dock */}
        <nav className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-6 lg:hidden">
          <div className="flex items-center gap-1 rounded-pill border border-ink-100 bg-[rgba(20,20,20,0.85)] px-2 py-2 shadow-card backdrop-blur-dock">
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 rounded-full px-4 py-2 text-[11px] font-medium transition-colors duration-150 ease-premium ${
                    active ? 'text-brass' : 'text-ink-400'
                  }`}
                >
                  <span className="relative">
                    <Icon className="h-5 w-5" />
                    {item.href === '/call' && <CallUnreadBadge />}
                  </span>
                  {item.label}
                </Link>
              );
            })}
            <LogoutButton className="px-3 !text-[11px]" />
          </div>
        </nav>

        <CallOverlay />
      </div>
    </CallProvider>
  );
}
