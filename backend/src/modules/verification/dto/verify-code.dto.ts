import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class VerifyCodeDto {
  // Uppercased/trimmed defensively in the service before hashing —
  // officers may type lowercase or with stray whitespace at the gate.
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'code must be alphanumeric' })
  code!: string;
}
