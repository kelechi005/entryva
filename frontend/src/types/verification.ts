// Mirrors VerificationResult / PublicVerificationOutcome in
// backend/src/modules/verification/verification.service.ts.

export type VerificationOutcome =
  | 'VALID'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'REVOKED'
  | 'ALREADY_USED'
  | 'NOT_FOUND';

export interface VerifiedInvitation {
  invitationId: string;
  visitorName: string;
  residentName: string;
  residentPhone: string | null;
  apartmentLabel: string;
  validUntil: string;
  status: string;
  entryPolicy: string;
}

export interface VerificationResult {
  outcome: VerificationOutcome;
  invitation?: VerifiedInvitation;
  // Set by the frontend itself (never returned by the online endpoints)
  // when a scan was resolved locally via offline/verify-offline.ts
  // instead of a round trip to the server. See CLAUDE.md §25 — the UI
  // must clearly indicate when verification is offline.
  offline?: boolean;
}
