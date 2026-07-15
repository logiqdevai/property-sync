import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateScraperDto {
  @ApiProperty({ description: 'Source agency this scraper belongs to' })
  @IsUUID()
  source_agency_id: string;

  @ApiProperty({
    description: 'Scraper display name',
    example: 'Acme listing scraper',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Max SourceProperties to AI-normalize per crawl. Null/omit = unlimited.',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  normalize_limit?: number | null;

  @ApiProperty({
    required: false,
    description:
      'Initial scraper config (start_url, listing_selector, fields, pagination, ...). Omit to create the scraper without an initial version.',
    example: { start_url: 'https://acme-realestate.com/listings' },
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
