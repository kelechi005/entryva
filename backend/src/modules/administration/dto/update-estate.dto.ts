import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

// ESTATE_ADMIN (their own estate) or SUPER_ADMIN (any estate via
// ?estateId=) — everything here was previously settable only once, at
// createEstate time, with no way to correct or update it afterwards.
export class UpdateEstateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;
}
