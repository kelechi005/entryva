import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateInvitationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  visitorName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  visitorPhone?: string;

  // "2026-09-12"
  @IsDateString()
  visitDate!: string;

  // "16:00" — validated against a 24h HH:mm pattern rather than IsDateString
  // since it's a wall-clock time in the estate's timezone, not a full instant.
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be in HH:mm format' })
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be in HH:mm format' })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsIn(['ONE_TIME', 'MULTI_ENTRY'])
  entryPolicy?: 'ONE_TIME' | 'MULTI_ENTRY';
}
