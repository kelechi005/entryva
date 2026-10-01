import { Transform } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Everything the visitor navigation needs, set in one save so the
// estate can never be left half-configured (e.g. a gate with no name).
// Coordinates are in decimal degrees (WGS84), the same as GPS and Mapbox.
export class UpdateEstateLocationDto {
  // Estate pin (roughly the middle of the estate).
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  // Main visitor entrance - the point visitors are routed to.
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  mainGateName!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  mainGateLatitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  mainGateLongitude!: number;

  // Short tip shown to visitors, e.g. "Beside the Total filling station".
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(240)
  entranceInstructions?: string;

  // How close (metres) counts as "arrived". Small enough not to trigger
  // on the main road, big enough to survive normal GPS drift.
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(500)
  arrivalRadiusMeters?: number;
}
