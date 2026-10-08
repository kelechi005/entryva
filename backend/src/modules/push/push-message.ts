// What a push notification says, for every notification type. Kept as one
// plain function so the wording lives in a single place and can be tested
// without sending anything. Messages are deliberately short: they appear on
// a phone's lock screen, and push payloads are small.

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification goes (a path inside the app). */
  url: string;
  /** Messages with the same tag replace each other instead of piling up. */
  tag: string;
  /** Emergencies: delivered immediately and stay on screen until dealt with. */
  urgent: boolean;
}

type Payload = Record<string, unknown> | undefined | null;

const EMERGENCY_LABEL: Record<string, string> = {
  FIRE: 'Fire',
  MEDICAL: 'Medical emergency',
  SECURITY: 'Security threat',
  OTHER: 'Emergency',
};

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}\u2026`;
}

export function emergencyLabel(kind: unknown): string {
  return EMERGENCY_LABEL[typeof kind === 'string' ? kind : ''] ?? 'Emergency';
}

export function buildPushMessage(type: string, payload: Payload): PushMessage {
  const p = payload ?? {};
  const visitor = text(p.visitorName, 'Your visitor');
  const id = text(p.invitationId, '');

  switch (type) {
    // ---- Visitor arrival (the visitor shared their trip and reached the gate) ----
    case 'VISITOR_ARRIVED':
      return {
        title: 'Your visitor is at the gate',
        body: `${visitor} has arrived at the gate.`,
        url: id ? `/visitors/track/${id}` : '/notifications',
        tag: `arrived-${id || 'visitor'}`,
        urgent: false,
      };

    // ---- Estate announcements and security alerts ----
    case 'ANNOUNCEMENT_POSTED':
      return {
        title: clip(text(p.title, 'New estate announcement'), 80),
        body: clip(text(p.preview, 'Open Entryva to read it.'), 160),
        url: '/alerts?tab=notices',
        tag: `announcement-${text(p.announcementId, 'new')}`,
        urgent: false,
      };
    case 'SECURITY_ALERT':
      return {
        title: clip(`Security alert: ${text(p.title, 'please read')}`, 80),
        body: clip(text(p.preview, 'Open Entryva for details.'), 160),
        url: '/alerts?tab=notices',
        tag: `security-alert-${text(p.announcementId, 'new')}`,
        urgent: true,
      };

    // ---- Emergencies ----
    case 'EMERGENCY_RAISED':
      return {
        title: `Emergency: ${emergencyLabel(p.kind)}`,
        body: clip(`${text(p.apartmentLabel, 'An apartment')} \u2014 ${text(p.raisedByName, 'a resident')}`, 160),
        url: '/alerts?tab=emergencies',
        tag: `emergency-${text(p.alertId, 'new')}`,
        urgent: true,
      };
    case 'EMERGENCY_ACKNOWLEDGED':
      return {
        title: 'Help is on the way',
        body: `${text(p.responderName, 'Security')} is responding to your alert.`,
        url: '/alerts?tab=emergencies',
        tag: `emergency-${text(p.alertId, 'new')}`,
        urgent: true,
      };
    case 'EMERGENCY_RESOLVED':
      return {
        title: 'Your alert was closed',
        body: 'Your emergency alert has been marked resolved.',
        url: '/alerts?tab=emergencies',
        tag: `emergency-${text(p.alertId, 'new')}`,
        urgent: false,
      };

    // ---- Existing resident notifications (same wording as the in-app bell) ----
    case 'VISITOR_VERIFIED':
      return plain('Visitor verified', `${visitor} was verified at the gate.`, type, id);
    case 'VISITOR_ENTERED':
      return plain('Visitor came in', `${visitor} has entered the estate.`, type, id);
    case 'VISITOR_EXITED':
      return plain('Visitor left', `${visitor} has exited the estate.`, type, id);
    case 'INVITATION_EXPIRED':
      return plain('Invitation expired', `The invitation for ${visitor} expired.`, type, id);
    case 'INVITATION_EXTENDED':
      return plain('Pass extended', `The pass for ${visitor} was extended.`, type, id);
    case 'INVITATION_CREATED':
      return plain('Invitation created', `Invitation created for ${visitor}.`, type, id);
    case 'INVITATION_REVOKED':
      return plain('Invitation revoked', `Invitation for ${visitor} was revoked.`, type, id);
    case 'RECURRING_PASS_ENTERED':
      return plain('Regular visitor came in', `${text(p.visitorName, 'Your regular visitor')} came in.`, type, id);
    case 'RECURRING_PASS_EXITED':
      return plain('Regular visitor left', `${text(p.visitorName, 'Your regular visitor')} went out.`, type, id);
    case 'RECURRING_PASS_OVERDUE':
      return plain(
        'Regular visitor still inside',
        `${text(p.visitorName, 'Your regular visitor')} is still marked inside past their allowed hours.`,
        type,
        id,
      );

    default:
      return plain('Entryva', 'You have a new notification.', type, id);
  }
}

function plain(title: string, body: string, type: string, id: string): PushMessage {
  return { title, body, url: '/notifications', tag: `${type.toLowerCase()}-${id || 'x'}`, urgent: false };
}
