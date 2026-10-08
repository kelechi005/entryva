import {
  alertNotificationCopy,
  bannerText,
  emergencyLabel,
  openAlerts,
  sortEmergencies,
  statusLabel,
  telHref,
} from '../alerts';
import { describe as describeNotification } from '@/components/notifications/NotificationBell';
import type { EmergencyAlertView } from '@/types/alerts';

function alert(over: Partial<EmergencyAlertView>): EmergencyAlertView {
  return {
    id: 'a1',
    kind: 'FIRE',
    note: null,
    status: 'OPEN',
    apartmentLabel: 'Block A \u00b7 3',
    raisedByName: 'Ada',
    createdAt: '2026-10-05T10:00:00.000Z',
    acknowledgedByName: null,
    acknowledgedAt: null,
    resolvedByName: null,
    resolvedAt: null,
    callPhone: null,
    ...over,
  };
}

describe('emergency helpers', () => {
  it('names kinds and statuses in plain words', () => {
    expect(emergencyLabel('MEDICAL')).toBe('Medical');
    expect(emergencyLabel('SECURITY')).toBe('Security threat');
    expect(statusLabel('OPEN')).toBe('Waiting for help');
    expect(statusLabel('ACKNOWLEDGED')).toBe('Help is on the way');
    expect(statusLabel('RESOLVED')).toBe('Resolved');
  });

  it('puts alerts that need attention first, newest first inside each group', () => {
    const sorted = sortEmergencies([
      alert({ id: 'resolved-new', status: 'RESOLVED', createdAt: '2026-10-05T12:00:00.000Z' }),
      alert({ id: 'open-old', status: 'OPEN', createdAt: '2026-10-05T08:00:00.000Z' }),
      alert({ id: 'ack', status: 'ACKNOWLEDGED', createdAt: '2026-10-05T11:00:00.000Z' }),
      alert({ id: 'open-new', status: 'OPEN', createdAt: '2026-10-05T09:00:00.000Z' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['open-new', 'open-old', 'ack', 'resolved-new']);
  });

  it('does not change the list it is given', () => {
    const input = [alert({ id: 'x', status: 'RESOLVED' }), alert({ id: 'y', status: 'OPEN' })];
    sortEmergencies(input);
    expect(input.map((a) => a.id)).toEqual(['x', 'y']);
  });

  it('counts only open alerts for the banner', () => {
    const list = [alert({ id: '1' }), alert({ id: '2', status: 'ACKNOWLEDGED' }), alert({ id: '3', status: 'RESOLVED' })];
    expect(openAlerts(list).map((a) => a.id)).toEqual(['1']);
  });

  it('writes the banner line for the newest open alert, and counts the rest', () => {
    expect(bannerText([])).toBe('');
    expect(bannerText([alert({})])).toBe('Fire \u2014 Block A \u00b7 3');
    const two = [
      alert({ id: 'old', kind: 'FIRE', createdAt: '2026-10-05T09:00:00.000Z' }),
      alert({ id: 'new', kind: 'MEDICAL', apartmentLabel: 'Block B \u00b7 1', createdAt: '2026-10-05T10:00:00.000Z' }),
    ];
    expect(bannerText(two)).toBe('Medical \u2014 Block B \u00b7 1 (+1 more)');
  });
});

describe('telHref', () => {
  it('builds a safe tel: link', () => {
    expect(telHref('+234 801 234 5678')).toBe('tel:+2348012345678');
    expect(telHref('0801-234-5678')).toBe('tel:08012345678');
  });

  it('returns null for nothing or for junk, never a link with odd characters', () => {
    expect(telHref(null)).toBeNull();
    expect(telHref('')).toBeNull();
    expect(telHref('abc')).toBeNull();
    expect(telHref('12')).toBeNull();
    expect(telHref('0801<script>')).toBeNull(); // only 4 digits left: too short to be a number
    expect(telHref('08012<script>34567')).toBe('tel:0801234567'); // anything odd is stripped out
  });
});

describe('wording for the in-app bell', () => {
  it('describes each new notification type', () => {
    expect(alertNotificationCopy('VISITOR_ARRIVED', { visitorName: 'Chidi' })).toBe('Chidi has arrived at the gate.');
    expect(alertNotificationCopy('VISITOR_ARRIVED', null)).toBe('Your visitor has arrived at the gate.');
    expect(alertNotificationCopy('ANNOUNCEMENT_POSTED', { title: 'Water shut-off' })).toBe('Estate notice: Water shut-off');
    expect(alertNotificationCopy('SECURITY_ALERT', { title: 'Suspicious person' })).toBe('Security alert: Suspicious person');
    expect(
      alertNotificationCopy('EMERGENCY_RAISED', { kind: 'FIRE', apartmentLabel: 'Block A \u00b7 3', raisedByName: 'Ada' }),
    ).toBe('Emergency (Fire): Block A \u00b7 3 \u2014 Ada');
    expect(alertNotificationCopy('EMERGENCY_ACKNOWLEDGED', { responderName: 'Musa' })).toBe(
      'Musa is responding to your emergency alert.',
    );
    expect(alertNotificationCopy('EMERGENCY_RESOLVED', null)).toBe('Your emergency alert was marked resolved.');
  });

  it('leaves older notification types to the bell', () => {
    expect(alertNotificationCopy('VISITOR_ENTERED', null)).toBeNull();
  });

  it('shows the new wording through the bell itself (and keeps the old wording)', () => {
    const base = { id: '1', userId: 'u', readAt: null, createdAt: '2026-10-05T10:00:00.000Z' };
    expect(
      describeNotification({ ...base, type: 'SECURITY_ALERT' as never, payload: { title: 'Suspicious person' } }),
    ).toBe('Security alert: Suspicious person');
    expect(describeNotification({ ...base, type: 'VISITOR_ENTERED', payload: { visitorName: 'Chidi' } })).toBe(
      'Chidi has entered the estate.',
    );
  });
});
