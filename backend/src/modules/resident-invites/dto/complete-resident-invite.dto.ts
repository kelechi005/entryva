import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteResidentInviteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  // The resident's own choice, set once, here — never assigned by an
  // admin. Same minimum as CreateResidentDto's temporaryPassword; this
  // supersedes that field as the normal onboarding path.
  @IsString()
  @MinLength(8)
  password!: string;
}
