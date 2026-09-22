'use client';

// Resident Dashboard — Dark Luxury Glassmorphism. Greeting, then the main
// stats card with a soft blue glow, the primary "Invite Visitor" action, a
// quick-actions grid, and Recent Visitors. Desktop widens into a two
// column layout (recent visitors + a shortcuts/glance panel) rather than
// just stretching the mobile stack full-width.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { StatusBadge, toStatusBadgeKey } from '@/components/ui/StatusBadge';
import { apiFetch } from '@/lib/api-client';
import { formatVisitWindow } from '@/lib/format';
import type { ResidentOverview, InvitationHistoryItem } from '@/types/invitation';
import type { AuthenticatedUser } from '@/types/auth';
import {
  PlusIcon,
  VisitorsIcon,
  BellIcon,
  ShieldIcon,
  UserIcon,
  ChevronRightIcon,
} from '@/components/ui/icons';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function ResidentDashboardPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [overview, setOverview] = useState<ResidentOverview | null>(null);
  const [recent, setRecent] = useState<InvitationHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [me, overviewData, invitations] = await Promise.all([
          apiFetch<AuthenticatedUser>('/auth/me'),
          apiFetch<ResidentOverview>('/invitations/overview'),
          apiFetch<InvitationHistoryItem[]>('/invitations'),
        ]);
        if (cancelled) return;
        setUser(me);
        setOverview(overviewData);
        setRecent(invitations.slice(0, 5));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      {/* Greeting */}
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-up">
          <h1 className="font-display text-[32px] font-bold leading-tight text-ink">
            {greeting()}
            {user ? `, ${user.displayName}` : ''} 👋
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[15px] text-ink-400">
            <UserIcon className="h-4 w-4" />
            Here&rsquo;s what&rsquo;s happening at your apartment.
          </p>
        </div>
        <Link href="/visitors/new" className="hidden sm:block">
          <Button className="gap-2">
            <PlusIcon className="h-4 w-4" /> Invite Visitor
          </Button>
        </Link>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          {/* Main stats card — glass, soft blue glow */}
          {loading ? (
            <div className="h-[180px] animate-pulse rounded-card bg-white/[0.04]" />
          ) : overview ? (
            <div className="glass-card relative overflow-hidden rounded-card px-6 py-6 shadow-glow sm:px-8 sm:py-7">
              <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brass/20 blur-[80px]" />
              <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
                <Stat label="Visitors Today" value={overview.totalVisits} />
                <Stat label="Scheduled" value={overview.upcomingVisitors} />
                <Stat label="Inside Estate" value={overview.currentlyInside} tone="success" />
                <Stat label="Active Passes" value={overview.activeInvitations} tone="accent" />
              </div>
              <div className="relative mt-6 flex items-center gap-2 border-t border-ink-100 pt-4 text-xs font-medium text-ink-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verified opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-verified" />
                </span>
                Live monitoring active
              </div>
            </div>
          ) : null}

          {/* Primary action — mobile only, desktop has it in the header */}
          <Link href="/visitors/new" className="sm:hidden">
            <Button fullWidth className="h-[58px] gap-2 text-base">
              <PlusIcon className="h-5 w-5" /> Invite Visitor
            </Button>
          </Link>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction href="/visitors/history" label="Visitor History" icon={VisitorsIcon} />
            <QuickAction href="/visitors/new" label="Invite Again" icon={PlusIcon} />
            <QuickAction href="/visitors/history" label="Notifications" icon={BellIcon} />
            <QuickAction href="/visitors/history" label="Security" icon={ShieldIcon} />
          </div>

          {/* Recent visitors */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-ink">Recent Visitors</h2>
              <Link href="/visitors/history" className="text-sm font-medium text-brass hover:underline">
                View all
              </Link>
            </div>

            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[90px] animate-pulse rounded-card bg-white/[0.04]" />
                ))}
              </div>
            ) : !loading && recent.length === 0 && !error ? (
              <div className="glass-card flex flex-col items-center gap-3 rounded-card px-6 py-10 text-center">
                <p className="text-ink-400">You haven&rsquo;t invited anyone yet.</p>
                <Link href="/visitors/new">
                  <Button variant="secondary">Create your first invitation</Button>
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {recent.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="glass-card flex min-h-[90px] items-center justify-between gap-4 rounded-card px-5 py-4 transition-colors duration-150 ease-premium hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold text-ink">
                        {initials(invitation.visitorName)}
                      </span>
                      <div>
                        <p className="font-semibold text-ink">{invitation.visitorName}</p>
                        <p className="text-sm text-ink-400">
                          {formatVisitWindow(invitation.validFrom, invitation.validUntil)}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={toStatusBadgeKey(invitation.status)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Desktop side panel */}
        <aside className="hidden flex-col gap-6 lg:flex">
          <div className="glass-card rounded-card px-6 py-6">
            <p className="text-sm font-semibold text-ink">This week</p>
            <p className="mt-1 text-xs text-ink-400">A quick glance at your estate activity.</p>
            <div className="mt-5 flex flex-col gap-4">
              <MiniRow label="Total visits" value={overview?.totalVisits ?? '\u2026'} />
              <MiniRow label="Currently inside" value={overview?.currentlyInside ?? '\u2026'} tone="success" />
              <MiniRow label="Upcoming" value={overview?.upcomingVisitors ?? '\u2026'} tone="accent" />
              <MiniRow label="Active passes" value={overview?.activeInvitations ?? '\u2026'} />
            </div>
          </div>

          <Link
            href="/visitors/new"
            className="glass-card group flex items-center justify-between rounded-card px-6 py-5 transition-colors duration-150 ease-premium hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-semibold text-ink">Need someone in today?</p>
              <p className="mt-1 text-xs text-ink-400">Generate a pass in under a minute.</p>
            </div>
            <ChevronRightIcon className="h-4 w-4 text-ink-400 transition-transform duration-150 ease-premium group-hover:translate-x-1" />
          </Link>
        </aside>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'accent' | 'success';
}) {
  const toneClass =
    tone === 'accent' ? 'text-brass' : tone === 'success' ? 'text-verified' : 'text-ink';
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-ink-400">{label}</span>
      <span className={`font-display text-[28px] font-bold leading-none sm:text-[32px] ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function MiniRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'accent' | 'success';
}) {
  const toneClass =
    tone === 'accent' ? 'text-brass' : tone === 'success' ? 'text-verified' : 'text-ink';
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-400">{label}</span>
      <span className={`text-sm font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function QuickAction({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
}) {
  return (
    <Link
      href={href}
      className="glass-card flex h-[90px] flex-col items-center justify-center gap-2 rounded-card text-center transition-all duration-150 ease-premium hover:scale-[1.02] hover:bg-white/[0.06]"
    >
      <Icon className="h-5 w-5 text-brass" />
      <span className="px-2 text-xs font-medium leading-tight text-ink-400">{label}</span>
    </Link>
  );
}
