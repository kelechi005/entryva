// Mirrors AuthenticatedUser in backend/src/modules/auth/auth.types.ts,
// returned verbatim by GET /auth/me.
export type AppRole = 'SUPER_ADMIN' | 'ESTATE_ADMIN' | 'RESIDENT' | 'SECURITY_OFFICER';

export interface AuthenticatedUser {
  userId: string;
  role: AppRole;
  displayName: string;
  residentId?: string;
  estateId?: string;
  apartmentId?: string;
  securityOfficerId?: string;
}
