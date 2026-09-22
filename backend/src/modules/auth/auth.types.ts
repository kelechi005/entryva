import { AppRole } from '../../common/decorators/roles.decorator';

/**
 * Attached to `req.user` by JwtStrategy.validate() after the JWT is
 * verified. This — not anything in the request body — is the only
 * trustworthy source of "who is making this request" for the rest of
 * the app. Role-specific IDs are populated based on `role`.
 */
export interface AuthenticatedUser {
  userId: string;
  role: AppRole;
  displayName: string;

  // Populated when role === 'RESIDENT'
  residentId?: string;
  estateId?: string;
  apartmentId?: string;

  // Populated when role === 'SECURITY_OFFICER'
  securityOfficerId?: string;

  // Populated when role === 'ESTATE_ADMIN' (estateId reused from above,
  // set from User.adminEstateId). Left unset for SUPER_ADMIN, which is
  // deliberately not scoped to one estate.
}
