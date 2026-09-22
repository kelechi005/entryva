import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * One offline-verified allow/deny decision a gate device is reporting
 * after reconnecting. `clientEventId` is the idempotency key generated
 * on-device at the moment of the decision (CLAUDE.md §26) — the server
 * must treat a retried submission of the same id as a no-op, not a
 * second entry/deny.
 */
export class OfflineSyncEventDto {
  @IsString()
  clientEventId!: string;

  @IsString()
  invitationId!: string;

  @IsIn(['ALLOWED', 'DENIED'])
  decision!: 'ALLOWED' | 'DENIED';

  @IsIn(['QR', 'MANUAL_CODE'])
  method!: 'QR' | 'MANUAL_CODE';

  // When this happened on the device, per the device's own clock, while
  // offline — distinct from when the server eventually processes it.
  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class OfflineSyncBatchDto {
  @IsString()
  deviceId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OfflineSyncEventDto)
  events!: OfflineSyncEventDto[];
}
