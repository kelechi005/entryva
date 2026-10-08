// Plain helpers for the alerts screens (kept free of React so they can be tested).

import type { EmergencyAlertView, EmergencyKind, EmergencyStatus } from '@/types/alerts';

export const EMERGENCY_KINDS: Array<{ kind: EmergencyKind; label: string; hint: string }> = [
  { kind: 'FIRE', label: 'Fire', hint: 'Smoke, flames or a gas smell' },
  { kind: 'MEDICAL', label: 'Medical', hint: 'Someone is hurt or very unwell' },
  { kind: 'SECURITY', label: 'Security threat', hint: 'Intruder, theft or someone dangerous' },
  { kind: 'OTHER', label: 'Other emergency', hint: 'Anything else that needs help now' },
];

export function emergencyLabel(kind: EmergencyKind): string {
  return EMERGENCY_KINDS.find((k) => k.kind === kind)?.label ?? 'Emergency';
}

export function statusLabel(status: EmergencyStatus): string {
  return status === 'OPEN' ? 'Waiting for help' : status === 'ACKNOWLEDGED' ? 'Help is on the way' : 'Resolved';
}

const STATUS_ORDER: Record<EmergencyStatus, number> = { OPEN: 0, ACKNOWLEDGED: 1, RESOLVED: 2 };

/** Needs-attention first (open, then being handled), newest first inside each group. */
export function sortEmergencies(alerts: EmergencyAlertView[]): EmergencyAlertView[] {
  return [...alerts].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function openAlerts(alerts: EmergencyAlertView[]): EmergencyAlertView[] {
  return alerts.filter((a) => a.status === 'OPEN');
}

/** One line for the red banner. */
export function bannerText(open: EmergencyAlertView[]): string {
  if (open.length === 0) return '';
  const first = [...open].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const head = `${emergencyLabel(first.kind)} \u2014 ${first.apartmentLabel}`;
  return open.length > 1 ? `${head} (+${open.length - 1} more)` : head;
}

/** A phone number safe to put in a tel: link (digits, plus, nothing else). */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 5 ? `tel:${cleaned}` : null;
}

/**
 * Wording for the in-app bell. Returns null for types this file doesn't own,
 * so the bell keeps using its own wording for the older notification types.
 */
export function alertNotificationCopy(type: string, payload: Record<string, unknown> | null): string | null {
  const text = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
  switch (type) {
    case 'VISITOR_ARRIVED':
      return `${text(payload?.visitorName, 'Your visitor')} has arrived at the gate.`;
    case 'ANNOUNCEMENT_POSTED':
      return `Estate notice: ${text(payload?.title, 'a new announcement')}`;
    case 'SECURITY_ALERT':
      return `Security alert: ${text(payload?.title, 'please read')}`;
    case 'EMERGENCY_RAISED': {
      const kind = typeof payload?.kind === 'string' ? (payload.kind as EmergencyKind) : 'OTHER';
      return `Emergency (${emergencyLabel(kind)}): ${text(payload?.apartmentLabel, 'an apartment')} \u2014 ${text(payload?.raisedByName, 'a resident')}`;
    }
    case 'EMERGENCY_ACKNOWLEDGED':
      return `${text(payload?.responderName, 'Security')} is responding to your emergency alert.`;
    case 'EMERGENCY_RESOLVED':
      return 'Your emergency alert was marked resolved.';
    default:
      return null;
  }
}
