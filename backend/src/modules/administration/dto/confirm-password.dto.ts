import { IsString, MinLength } from 'class-validator';

/**
 * Body for destructive admin actions that require re-entering the
 * acting admin's own current password first (removing a resident or
 * security officer). This is intentionally the admin's password, not
 * the target account's — it proves "the person at this keyboard is
 * still the admin", not anything about the person being removed.
 */
export class ConfirmPasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;
}
