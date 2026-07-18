import { ApiProperty } from '@nestjs/swagger';
import { ListingType, PropertyStatus, PropertyType } from 'generated/prisma';

export class UserPropertyEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiProperty()
  canonical_property_id: string;

  @ApiProperty()
  property_id: string;

  @ApiProperty({ nullable: true })
  internal_id: string | null;

  @ApiProperty({ nullable: true })
  integration_property_id: string | null;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: ListingType })
  listing_type: ListingType;

  @ApiProperty({ enum: PropertyType })
  property_type: PropertyType;

  @ApiProperty({ enum: PropertyStatus })
  status: PropertyStatus;

  @ApiProperty({ nullable: true })
  price: string | null;

  @ApiProperty({ nullable: true })
  price_start: string | null;

  @ApiProperty({ nullable: true })
  price_web: string | null;

  @ApiProperty({ nullable: true })
  currency: string | null;

  @ApiProperty({ nullable: true })
  city: string | null;

  @ApiProperty({ nullable: true })
  district: string | null;

  @ApiProperty({ nullable: true })
  address: string | null;

  @ApiProperty({ nullable: true })
  postal_code: string | null;

  @ApiProperty({ nullable: true })
  country: string | null;

  @ApiProperty({ nullable: true })
  square_meters: string | null;

  @ApiProperty({ nullable: true })
  bedrooms: number | null;

  @ApiProperty({ nullable: true })
  bathrooms: number | null;

  @ApiProperty({ nullable: true })
  floor: string | null;

  @ApiProperty({ nullable: true })
  construction_year: number | null;

  @ApiProperty({ nullable: true })
  renovation_year: number | null;

  @ApiProperty({ nullable: true })
  estateweb_type_id: number | null;

  @ApiProperty({ nullable: true })
  estateweb_location_id: number | null;

  @ApiProperty({ nullable: true })
  video_url: string | null;

  @ApiProperty({ nullable: true })
  distance_airport: string | null;

  @ApiProperty({ nullable: true })
  distance_port: string | null;

  @ApiProperty({ nullable: true })
  distance_beach: string | null;

  @ApiProperty({ nullable: true })
  cms_fields: unknown;

  @ApiProperty({ nullable: true })
  cms_metadata: unknown;

  @ApiProperty()
  is_modified: boolean;

  @ApiProperty({ nullable: true })
  last_synced_at: Date | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
