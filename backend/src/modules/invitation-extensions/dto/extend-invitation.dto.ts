import { IsInt, Max, Min } from 'class-validator';

export class ExtendInvitationDto {
  // The estate's own maximum is enforced in the service; this is just a sanity cap.
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;
}
