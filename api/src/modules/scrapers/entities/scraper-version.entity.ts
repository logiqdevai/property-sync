import { ApiProperty } from '@nestjs/swagger';
import { ScraperVersionCreatedBy } from 'generated/prisma';

export class ScraperVersion {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty()
  scraper_id: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({
    description:
      'Full scraper definition: start_url, listing_selector, fields, pagination, ...',
  })
  config: Record<string, unknown>;

  @ApiProperty({
    enum: ScraperVersionCreatedBy,
    example: ScraperVersionCreatedBy.USER,
  })
  created_by: ScraperVersionCreatedBy;

  @ApiProperty({ nullable: true })
  notes: string | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
