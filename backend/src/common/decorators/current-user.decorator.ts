import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';

/**
 * Pulls the authenticated user (attached by JwtStrategy.validate) off the
 * request. Never trust a userId/estateId/residentId passed in the request
 * body instead of this — that is exactly how tenant isolation gets broken.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthenticatedUser;
  },
);
