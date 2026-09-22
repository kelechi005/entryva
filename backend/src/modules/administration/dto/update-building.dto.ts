import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBuildingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;
}
