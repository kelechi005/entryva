'use client';

// Emergency alerts as cards. Residents see their own and can close them;
// security officers and the admin see the estate's and can respond.

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PhoneIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import { emergencyLabel, sortEmergencies, statusLabel, telHref } from '@/lib/alerts';
import { formatRelativeTime } from '@/lib/format';
import type { EmergencyAlertView, EmergencyStatus } from '@/types/alerts';

const BADGE: Record<EmergencyStatus, string> = {
  OPEN: 'bg-alert-50 text-alert',
  ACKNOWLEDGED: 'bg-warn-50 text-warn',
  RESOLVED: 'bg-verified-50 text-verified',
};

interface Props {
  alerts: EmergencyAlertView[];
  staff: boolean;
  onChange: (updated: EmergencyAlertView) => void;
}

export function EmergencyList({ alerts, staff, onChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: 'acknowledge' | 'resolve') {
    setBusyId(id);
    setError(null);
    try {
      const updated = await apiFetch<EmergencyAlertView>(`/emergency-alerts/${id}/${action}`, { method: 'POST' });
      onChange(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusyId(null);
    }
  }

  if (alerts.length === 0) {
    return (
      <EmptyState
        title={staff ? 'No emergency alerts' : 'You have not sent any alerts'}
        description={staff ? 'When a resident raises an emergency it will appear here straight away.' : ''}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}
      {sortEmergencies(alerts).map((a) => {
        const tel = staff ? telHref(a.callPhone) : null;
        return (
          <article
            key={a.id}
            className={`glass-card flex flex-col gap-3 rounded-card p-5 ${a.status === 'OPEN' ? 'border border-alert/50' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-lg font-semibold text-ink">{emergencyLabel(a.kind)}</p>
              <span className={`rounded-pill px-3 py-1 text-xs font-semibold ${BADGE[a.status]}`}>
                {statusLabel(a.status)}
              </span>
            </div>

            {staff && (
              <p className="text-sm text-ink">
                {a.apartmentLabel} &middot; {a.raisedByName}
              </p>
            )}
            {a.note && <p className="text-sm text-ink">&ldquo;{a.note}&rdquo;</p>}

            <p className="text-xs text-ink-400">
              Raised {formatRelativeTime(a.createdAt)}
              {a.acknowledgedByName && ` \u00b7 ${a.acknowledgedByName} responded ${formatRelativeTime(a.acknowledgedAt as string)}`}
              {a.resolvedByName && ` \u00b7 closed by ${a.resolvedByName}`}
            </p>

            {a.status !== 'RESOLVED' && (
              <div className="flex flex-wrap gap-2">
                {staff && a.status === 'OPEN' && (
                  <Button onClick={() => void act(a.id, 'acknowledge')} disabled={busyId === a.id}>
                    {busyId === a.id ? 'Working\u2026' : "I'm responding"}
                  </Button>
                )}
                {tel && (
                  <a
                    href={tel}
                    className="inline-flex items-center gap-2 rounded-[28px] border border-ink-100 px-5 py-3.5 text-sm font-semibold text-ink hover:bg-white/[0.04]"
                  >
                    <PhoneIcon className="h-4 w-4" /> Call
                  </a>
                )}
                <Button variant="ghost" onClick={() => void act(a.id, 'resolve')} disabled={busyId === a.id}>
                  {staff ? 'Mark resolved' : "I'm safe, close this"}
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
