import { ApiProperty } from '@nestjs/swagger';
import { PropertyStatus } from 'generated/prisma';

export class SourcePropertyEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  source_agency_id: string;

  @ApiProperty()
  property_id: string;

  @ApiProperty({ nullable: true })
  internal_id: string | null;

  @ApiProperty()
  source_url: string;

  @ApiProperty({ nullable: true })
  canonical_url: string | null;

  @ApiProperty({ nullable: true })
  raw_title: string | null;

  @ApiProperty({ nullable: true })
  raw_description: string | null;

  @ApiProperty({ nullable: true })
  raw_price: string | null;

  @ApiProperty({ nullable: true })
  raw_location: string | null;

  @ApiProperty({ nullable: true })
  raw_property_type: string | null;

  @ApiProperty({ nullable: true })
  raw_listing_type: string | null;

  @ApiProperty({ nullable: true })
  raw_sqm: string | null;

  @ApiProperty({ nullable: true })
  raw_bedrooms: string | null;

  @ApiProperty({ nullable: true })
  raw_bathrooms: string | null;

  @ApiProperty({ nullable: true })
  raw_html_path: string | null;

  @ApiProperty({ nullable: true })
  content_hash: string | null;

  @ApiProperty()
  first_seen_at: Date;

  @ApiProperty({ nullable: true })
  last_seen_at: Date | null;

  @ApiProperty({ enum: PropertyStatus })
  status: PropertyStatus;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
