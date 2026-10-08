import { Type } from 'class-transformer';
import { IsNotEmpty, IsObject, IsString, MaxLength, ValidateNested } from 'class-validator';

export class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth!: string;
}

// The shape a browser's PushSubscription.toJSON() produces.
export class SubscribePushDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class UnsubscribePushDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  endpoint!: string;
}
