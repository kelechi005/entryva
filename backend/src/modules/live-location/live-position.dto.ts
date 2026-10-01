import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class LivePositionDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  /** Direction of travel in degrees (0 = north). Null while standing still. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number | null;

  /** The phone's own GPS error estimate, in metres. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracyM?: number | null;
}
