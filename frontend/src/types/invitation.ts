export type InvitationStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'USED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'CANCELLED';

export type VisitorType = 'GUEST' | 'COURIER';

export interface CreateInvitationInput {
  visitorName: string;
  visitorPhone?: string;
  visitDate: string; // ISO date, e.g. "2026-09-12"
  startTime: string; // "16:00"
  endTime: string; // "20:00"
  notes?: string;
  visitorType?: VisitorType;
}

export interface CreatedInvitation {
  id: string;
  visitorName: string;
  visitorPhone?: string;
  residentName: string;
  apartmentLabel: string;
  validFrom: string;
  validUntil: string;
  status: InvitationStatus;
  displayCode: string; // plaintext, shown once
  shareUrl: string; // plaintext, shown once
  visitorType?: VisitorType;
}

// Shape returned by GET /invitations (InvitationsService.listForResident) —
// note this is deliberately not CreatedInvitation: it has no displayCode/
// shareUrl (those are one-time secrets, never re-issued after creation).
export interface InvitationHistoryItem {
  id: string;
  visitorName: string;
  visitorPhone?: string | null;
  apartmentLabel: string;
  validFrom: string;
  validUntil: string;
  status: InvitationStatus;
  entryPolicy: 'ONE_TIME' | 'MULTI_ENTRY';
  createdAt: string;
  revokedAt: string | null;
  usedAt: string | null;
  visitorType?: VisitorType;
}

// Mirrors InvitationsService.getResidentOverview.
export interface ResidentOverview {
  activeInvitations: number;
  upcomingVisitors: number;
  totalVisits: number;
  currentlyInside: number;
}

export interface PublicInvitation {
  visitorName: string;
  residentName: string;
  apartmentLabel: string;
  estateName: string;
  validFrom: string;
  validUntil: string;
  status: InvitationStatus;
  displayCode: string; // recomputed from the token by the backend
}
