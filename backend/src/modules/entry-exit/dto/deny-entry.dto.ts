import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DenyEntryDto {
  @IsString()
  invitationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
