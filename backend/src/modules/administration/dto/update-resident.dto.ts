import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateResidentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  // Re-assign the resident to a different apartment in the same estate.
  @IsOptional()
  @IsString()
  apartmentId?: string;
}
