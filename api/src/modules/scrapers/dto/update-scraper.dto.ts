import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';
import { DiagnosticsMode, ScraperStatus } from 'generated/prisma';

export class UpdateScraperDto {
  @ApiProperty({
    required: false,
    enum: ScraperStatus,
    description: 'Operational status of the scraper',
  })
  @IsOptional()
  @IsEnum(ScraperStatus)
  status?: ScraperStatus;

  @ApiProperty({
    required: false,
    description: 'Whether self-heal is allowed to auto-apply fixes',
  })
  @IsOptional()
  @IsBoolean()
  self_healing_enabled?: boolean;

  @ApiProperty({
    required: false,
    enum: DiagnosticsMode,
    description: "Debugging depth for this scraper's crawl runs",
  })
  @IsOptional()
  @IsEnum(DiagnosticsMode)
  diagnostics_mode?: DiagnosticsMode;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Max SourceProperties to AI-normalize per crawl. Null = unlimited.',
    example: 50,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  normalize_limit?: number | null;

  @ApiProperty({
    required: false,
    description:
      'Overwrites config.validation_rules on the active version. Stored via a new ScraperVersion — Scraper itself never holds config.',
  })
  @IsOptional()
  @IsObject()
  validation_rules?: Record<string, unknown>;
}
