import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class TrackAgencyDto {
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  track_new_listings?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  track_removed_listings?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  track_updated_listings?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  use_ai_batching?: boolean;

  @ApiProperty({ required: false, description: 'PATCH only' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
