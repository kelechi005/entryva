// Mirrors NotificationType in backend/src/modules/notifications/notifications.service.ts.
// Kept in sync manually for now — no shared types package exists yet.
export type NotificationType =
  | 'INVITATION_CREATED'
  | 'VISITOR_VERIFIED'
  | 'VISITOR_ENTERED'
  | 'VISITOR_EXITED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_EXPIRED';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}
