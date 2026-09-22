import { IsString } from 'class-validator';

export class RecordEntryDto {
  @IsString()
  invitationId!: string;
}
