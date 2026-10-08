import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RaiseEmergencyDto {
  @IsIn(['FIRE', 'MEDICAL', 'SECURITY', 'OTHER'])
  kind!: 'FIRE' | 'MEDICAL' | 'SECURITY' | 'OTHER';

  // Optional one-liner: "Smoke in the kitchen", "My father has collapsed".
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
