import { ApiProperty } from '@nestjs/swagger';
import { ListingType, PropertyStatus, PropertyType } from 'generated/prisma';

export class PropertyEntity {
  @ApiProperty()
  id: string;

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
  currency: string | null;

  @ApiProperty({ nullable: true })
  city: string | null;

  @ApiProperty({ nullable: true })
  district: string | null;

  @ApiProperty({ nullable: true })
  address: string | null;

  @ApiProperty({ nullable: true })
  duplicate_group_id: string | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
