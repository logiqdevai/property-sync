import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { AiProvider } from 'generated/prisma';

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

  @ApiProperty({ required: false, enum: AiProvider, default: AiProvider.OPENAI })
  @IsOptional()
  @IsEnum(AiProvider)
  ai_provider?: AiProvider;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  ai_model?: string | null;

  @ApiProperty({ required: false, description: 'PATCH only' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
