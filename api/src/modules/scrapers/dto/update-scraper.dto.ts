import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateScraperDto {
  @ApiProperty({
    required: false,
    description: 'Whether self-heal is allowed to auto-apply fixes',
  })
  @IsOptional()
  @IsBoolean()
  self_healing_enabled?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Overwrites config.validation_rules on the active version. Stored via a new ScraperVersion — Scraper itself never holds config.',
  })
  @IsOptional()
  @IsObject()
  validation_rules?: Record<string, unknown>;
}
