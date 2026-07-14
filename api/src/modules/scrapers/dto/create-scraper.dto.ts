import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, IsUUID, MinLength } from 'class-validator';

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
    description:
      'Initial scraper config (start_url, listing_selector, fields, pagination, ...)',
    example: { start_url: 'https://acme-realestate.com/listings' },
  })
  @IsObject()
  config: Record<string, unknown>;
}
