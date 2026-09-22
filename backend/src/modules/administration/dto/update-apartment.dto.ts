import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateApartmentDto {
  @IsOptional()
  @IsString()
  buildingId?: string;

  // Treated as opaque text, not a numeric value: "B-204", "Flat 4", etc.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  flatNumber?: string;
}
