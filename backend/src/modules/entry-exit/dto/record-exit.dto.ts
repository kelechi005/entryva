import { IsString } from 'class-validator';

export class RecordExitDto {
  @IsString()
  visitId!: string;
}
