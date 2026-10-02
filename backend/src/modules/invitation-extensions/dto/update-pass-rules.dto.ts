import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePassRulesDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(5)
  @Max(720)
  maxExtendMinutes!: number;

  @IsInt()
  @Min(30)
  @Max(2880)
  maxTotalMinutes!: number;

  // Quiet hours: minutes after local midnight. Send both, or both null to turn them off.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  quietFromMinute?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  quietToMinute?: number | null;
}
