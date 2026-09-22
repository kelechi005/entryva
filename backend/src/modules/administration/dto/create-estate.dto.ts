import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-iana-timezone.validator';

// SUPER_ADMIN only — creates a new estate tenant.
export class CreateEstateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;
}
