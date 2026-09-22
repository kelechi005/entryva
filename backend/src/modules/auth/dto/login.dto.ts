import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Accepts either an email or a phone number in the same field; the
  // service decides which column to match against.
  @IsString()
  @MinLength(3)
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
