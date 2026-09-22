import { IsEmail, IsString } from 'class-validator';

export class CreateResidentInviteDto {
  @IsString()
  apartmentId!: string;

  @IsEmail()
  email!: string;
}
