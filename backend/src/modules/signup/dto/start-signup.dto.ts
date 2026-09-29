import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// Public, unauthenticated: everything here is untrusted input.
export class StartSignupDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  estateName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  address!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  country!: string;

  @IsIanaTimezone()
  timezone!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  // ---- The person signing up (becomes the estate admin) ----
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  adminName!: string;

  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  adminPhone?: string;

  // bcrypt only uses the first 72 bytes; cap so a huge body can't be
  // used to burn CPU on hashing.
  @IsString()
  @MinLength(10, { message: 'password must be at least 10 characters' })
  @MaxLength(72)
  @Matches(/[A-Za-z]/, { message: 'password must contain a letter' })
  @Matches(/[0-9]/, { message: 'password must contain a number' })
  password!: string;
}
