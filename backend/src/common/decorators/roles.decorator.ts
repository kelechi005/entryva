import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type AppRole = 'SUPER_ADMIN' | 'ESTATE_ADMIN' | 'RESIDENT' | 'SECURITY_OFFICER';

/**
 * Restricts a route to the given roles. Always pair with JwtAuthGuard +
 * RolesGuard — a @Roles() decorator with no guard enforcing it is a no-op.
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
