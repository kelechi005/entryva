import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SecurityContext } from '../../modules/verification/verification.service';

/**
 * Pulls req.securityContext off the request — populated by
 * SecurityContextGuard, never by anything in the request body. Mirrors
 * CurrentUser/ResidentContextGuard's pattern for residents.
 */
export const CurrentSecurityContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SecurityContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.securityContext as SecurityContext;
  },
);
