'use client';

// Admin: estate overview / dashboard. A snapshot of the estate plus quick
// jumps into the sections that do the actual work — every number and
// row here comes straight from data the app already has (no invented
// widgets for features that don't exist yet, like visitor check-ins).

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import {
  UserIcon,
  BuildingIcon,
  ShieldIcon,
  VisitorsIcon,
  ChevronRightIcon,
  MapPinIcon,
  GlobeIcon,
  ClockIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
} from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import { describeAuditLog } from '@/lib/audit-log-descriptions';
import type { AdminAuditLog, AdminEstateSettings, AdminOverview } from '@/types/admin';

const QUICK_LINKS = [
  { href: '/residents', label: 'Add resident', icon: UserIcon },
  { href: '/properties', label: 'Add apartment', icon: BuildingIcon },
  { href: '/security-officers', label: 'Add officer', icon: ShieldIcon },
  { href: '/audit-logs', label: 'View audit logs', icon: ClockIcon },
];

export default function AdminEstatePage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [settings, setSettings] = useState<AdminEstateSettings | null>(null);
  const [recentLogs, setRecentLogs] = useState<AdminAuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  const [editingSettings, setEditingSettings] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    // Set once on mount (not at module scope) so the first render on the
    // server and the first render on the client always agree.
    setNow(new Date());
  }, []);

  function loadSettings() {
    apiFetch<AdminEstateSettings>('/admin/estate')
      .then(setSettings)
      .catch(() => {
        // Non-fatal for this page — the stat cards are the main content.
      });
  }

  useEffect(() => {
    apiFetch<AdminOverview>('/admin/overview')
      .then(setOverview)
      .catch(() => setError('Could not load the estate overview.'));
    loadSettings();
    apiFetch<AdminAuditLog[]>('/audit-logs')
      .then((logs) => setRecentLogs(logs.slice(0, 5)))
      .catch(() => {
        // Non-fatal — the activity preview is a bonus, not the page.
      });
  }, []);

  function startEditingSettings() {
    if (!settings) return;
    setNameInput(settings.name);
    setAddressInput(settings.address ?? '');
    setSettingsError(null);
    setEditingSettings(true);
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) {
      setSettingsError('The estate needs a name.');
      return;
    }
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const updated = await apiFetch<AdminEstateSettings>('/admin/estate', {
        method: 'PATCH',
        body: JSON.stringify({ name: nameInput.trim(), address: addressInput.trim() }),
      });
      setSettings(updated);
      setEditingSettings(false);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Could not save the estate details.');
    } finally {
      setSavingSettings(false);
    }
  }

  const hour = now?.getHours() ?? 9;
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={
          now
            ? now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
            : undefined
        }
        title="Admin"
        subtitle={`${greeting}. Here's what's happening at ${settings?.name ?? 'your estate'} today.`}
      />

      {error && <p className="text-alert">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Residents"
          value={overview ? overview.totalResidents : '\u2026'}
          icon={<UserIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Apartments"
          value={overview ? overview.totalApartments : '\u2026'}
          icon={<BuildingIcon className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard
          label="Security officers"
          value={overview ? overview.totalSecurityOfficers : '\u2026'}
          icon={<ShieldIcon className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Visitors today"
          value={overview ? overview.visitorsToday : '\u2026'}
          icon={<VisitorsIcon className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,320px]">
        <div className="flex flex-col gap-6">
          {settings && (
            <div className="glass-card rounded-card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-ink">Estate settings</h2>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold ${
                      settings.status === 'ACTIVE' ? 'bg-verified-50 text-verified' : 'bg-alert-50 text-alert'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${settings.status === 'ACTIVE' ? 'bg-verified' : 'bg-alert'}`} />
                    {settings.status === 'ACTIVE' ? 'Operational' : 'Suspended'}
                  </span>
                  {!editingSettings && (
                    <button
                      onClick={startEditingSettings}
                      aria-label="Edit estate settings"
                      className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-ink"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {editingSettings ? (
                <form onSubmit={saveSettings} className="mt-5 flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Estate name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
                    <Field
                      label="Address"
                      placeholder="Not set yet"
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-ink-400">
                    Timezone can&rsquo;t be changed here yet. Contact support if{' '}
                    {settings.timezone} is wrong for this estate.
                  </p>
                  {settingsError && <p className="text-sm text-alert">{settingsError}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={savingSettings}>
                      <CheckIcon className="h-4 w-4" /> {savingSettings ? 'Saving\u2026' : 'Save'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setEditingSettings(false)}>
                      <XIcon className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
                      <BuildingIcon className="h-3.5 w-3.5" /> Name
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-ink">{settings.name}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
                      <MapPinIcon className="h-3.5 w-3.5" /> Address
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-ink">
                      {settings.address ? (
                        settings.address
                      ) : (
                        <button onClick={startEditingSettings} className="text-brass underline">
                          Add an address
                        </button>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
                      <GlobeIcon className="h-3.5 w-3.5" /> Timezone
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-ink">{settings.timezone}</dd>
                  </div>
                </dl>
              )}
            </div>
          )}

          <div className="glass-card rounded-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Recent activity</h2>
              <Link href="/audit-logs" className="flex items-center gap-1 text-xs font-semibold text-brass hover:underline">
                View all <ChevronRightIcon className="h-3 w-3" />
              </Link>
            </div>
            {recentLogs.length === 0 ? (
              <EmptyState icon={<ClockIcon className="h-5 w-5" />} title="No audit events yet" />
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-ink-100">
                {recentLogs.map((log) => {
                  const described = describeAuditLog(log);
                  return (
                    <li key={log.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-ink-400">
                          <ClockIcon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-ink">{described.summary}</p>
                          {described.detail && <p className="text-xs text-ink-400">{described.detail}</p>}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-ink-400">{new Date(log.createdAt).toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="glass-card flex flex-col gap-2 rounded-card p-5">
          <h2 className="mb-1 font-display text-base font-semibold text-ink">Quick actions</h2>
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-2xl px-3.5 py-3 text-sm font-medium text-ink transition-colors duration-150 ease-premium hover:bg-white/[0.05]"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brass-50 text-brass">
                    <Icon className="h-4 w-4" />
                  </span>
                  {link.label}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-ink-400" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
