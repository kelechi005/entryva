import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSecurityOfficerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
