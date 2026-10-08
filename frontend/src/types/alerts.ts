// Mirrors AnnouncementView / EmergencyView in backend/src/modules/alerts.

export type AnnouncementKind = 'ANNOUNCEMENT' | 'SECURITY_ALERT';

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export type EmergencyKind = 'FIRE' | 'MEDICAL' | 'SECURITY' | 'OTHER';
export type EmergencyStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface EmergencyAlertView {
  id: string;
  kind: EmergencyKind;
  note: string | null;
  status: EmergencyStatus;
  apartmentLabel: string;
  raisedByName: string;
  createdAt: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  /** Only filled in for security officers / admins. */
  callPhone: string | null;
}

export interface RaiseEmergencyResult {
  alert: EmergencyAlertView;
  /** 0 means nobody could be told: the screen must say so. */
  notifiedCount: number;
  /** The same emergency pressed twice: no second alarm was sent. */
  duplicate: boolean;
}
