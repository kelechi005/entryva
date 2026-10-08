import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAnnouncementDto {
  // ANNOUNCEMENT = a normal estate notice (admin only).
  // SECURITY_ALERT = urgent: "suspicious person near the gate" (admin or officer).
  @IsIn(['ANNOUNCEMENT', 'SECURITY_ALERT'])
  kind!: 'ANNOUNCEMENT' | 'SECURITY_ALERT';

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}
