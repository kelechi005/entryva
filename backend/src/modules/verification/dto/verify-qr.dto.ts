import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class VerifyQrDto {
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token!: string;

  @IsOptional()
  offline?: boolean;
}
