import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RECURRING_ROLES = ['HOUSE_HELP', 'DRIVER', 'CLEANER', 'DELIVERY', 'OTHER'] as const;
export type RecurringRole = (typeof RECURRING_ROLES)[number];

export class CreateRecurringPassDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsIn(RECURRING_ROLES as unknown as string[])
  role!: RecurringRole;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1439)
  endMinute!: number;

  @Matches(DATE)
  validFrom!: string;

  @Matches(DATE)
  validUntil!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes?: number;
}

export class SkipDayDto {
  @Matches(DATE)
  date!: string;
}

export class ExtraDayDto {
  @Matches(DATE)
  date!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1439)
  endMinute?: number;
}

export class RenewPassDto {
  @IsInt()
  @Min(1)
  @Max(90)
  days!: number;
}

export class ScanRecurringDto {
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token!: string;
}
