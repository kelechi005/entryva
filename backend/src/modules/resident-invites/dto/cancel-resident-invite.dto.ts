import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for cancelling a not-yet-used resident invite. Optional reason —
 * unlike rejecting an already-submitted application, cancelling your own
 * invite before anyone's used it is low-stakes (e.g. "picked the wrong
 * apartment"), so we don't force the admin to type something.
 */
export class CancelResidentInviteDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}
