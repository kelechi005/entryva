import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Validates that a string is a real IANA timezone name (e.g.
 * "Africa/Lagos", "UTC") using the JS runtime's own ICU data via
 * Intl.DateTimeFormat, rather than shipping/maintaining a hardcoded
 * list. Intl.DateTimeFormat throws a RangeError for an unrecognized
 * zone, which is the standard way to check this without a dependency.
 *
 * Catching this here, at estate creation, matters because
 * `resolveVisitWindow` (src/common/time/visit-window.util.ts) trusts
 * `Estate.timezone` to already be valid — an estate created with a
 * typo'd zone (e.g. "Africa/Lagoss") would otherwise only surface as a
 * confusing failure the first time a resident tries to create an
 * invitation, far away from where the bad value was actually entered.
 */
export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid IANA timezone name (e.g. "Africa/Lagos", "UTC")`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}
