'use client';

// The one place for estate notices, security alerts and emergencies.
// Every push notification opens this page (/alerts?tab=notices or
// /alerts?tab=emergencies), so it has to make sense for all three roles:
//   resident         -> read notices; emergency button + their own alerts
//   security officer -> read notices; send security alerts; respond to emergencies
//   estate admin     -> post notices / security alerts; see + respond to emergencies

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { EmergencyButton } from '@/components/alerts/EmergencyButton';
import { EmergencyList } from '@/components/alerts/EmergencyList';
import { NoticesPanel } from '@/components/alerts/NoticesPanel';
import { PushToggle } from '@/components/alerts/PushToggle';
import { useEmergencyAlerts } from '@/hooks/useEmergencyAlerts';
import { openAlerts } from '@/lib/alerts';
import type { EmergencyAlertView, RaiseEmergencyResult } from '@/types/alerts';

type Role = 'RESIDENT' | 'SECURITY_OFFICER' | 'ESTATE_ADMIN';
type Tab = 'notices' | 'emergencies';

export function AlertsCenter({ role }: { role: Role }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = params.get('tab') === 'emergencies' ? 'emergencies' : 'notices';
  const staff = role !== 'RESIDENT';

  const { alerts, setAlerts, loading, error, refresh } = useEmergencyAlerts(15_000);
  const openCount = openAlerts(alerts).length;

  const setTab = useCallback(
    (next: Tab) => router.replace(`/alerts?tab=${next}`),
    [router],
  );

  function upsert(updated: EmergencyAlertView) {
    setAlerts((prev) => (prev.some((a) => a.id === updated.id) ? prev.map((a) => (a.id === updated.id ? updated : a)) : [updated, ...prev]));
  }

  function onRaised(result: RaiseEmergencyResult) {
    upsert(result.alert);
    void refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <PushToggle />

      <div role="tablist" aria-label="Alerts" className="flex gap-2">
        <button
          role="tab"
          aria-selected={tab === 'notices'}
          onClick={() => setTab('notices')}
          className={`rounded-pill px-5 py-2.5 text-sm font-semibold ${
            tab === 'notices' ? 'bg-brass-50 text-brass' : 'border border-ink-100 text-ink-400'
          }`}
        >
          Notices
        </button>
        <button
          role="tab"
          aria-selected={tab === 'emergencies'}
          onClick={() => setTab('emergencies')}
          className={`flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold ${
            tab === 'emergencies' ? 'bg-alert-50 text-alert' : 'border border-ink-100 text-ink-400'
          }`}
        >
          Emergencies
          {staff && openCount > 0 && (
            <span className="rounded-full bg-alert px-2 py-0.5 text-[11px] font-bold leading-none text-white">
              {openCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'notices' && <NoticesPanel role={role} />}

      {tab === 'emergencies' && (
        <div className="flex flex-col gap-5">
          {!staff && <EmergencyButton onRaised={onRaised} />}
          {error && (
            <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-ink-400">Loading&hellip;</p>
          ) : (
            <>
              {!staff && alerts.length > 0 && (
                <h2 className="font-display text-lg font-semibold text-ink">Your alerts</h2>
              )}
              <EmergencyList alerts={alerts} staff={staff} onChange={upsert} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
