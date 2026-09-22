import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateResidentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsString()
  apartmentId!: string;

  // A one-time temporary password the admin shares with the resident
  // out-of-band; the resident is expected to change it on first login
  // once that flow exists (tracked as a TODO — not yet built).
  @IsString()
  @MinLength(8)
  temporaryPassword!: string;
}
