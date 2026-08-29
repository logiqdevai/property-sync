import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { ListingType, PropertyStatus, PropertyType } from 'generated/prisma';

export class UpdateUserPropertyDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ required: false, enum: ListingType })
  @IsOptional()
  @IsEnum(ListingType)
  listing_type?: ListingType;

  @ApiProperty({ required: false, enum: PropertyType })
  @IsOptional()
  @IsEnum(PropertyType)
  property_type?: PropertyType;

  @ApiProperty({ required: false, enum: PropertyStatus })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  price?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  currency?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  city?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  district?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  postal_code?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  country?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  square_meters?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  floor?: string | null;

  @ApiProperty({ required: false, nullable: true, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[] | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  construction_year?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  renovation_year?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  estateweb_scope_id?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  estateweb_type_id?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  estateweb_location_id?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  estateweb_energy_class_id?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  estateweb_road_type_id?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  video_url?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  distance_airport?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  distance_port?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  distance_beach?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  price_start?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  price_web?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  integration_property_id?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  property_id?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  internal_id?: string | null;
}
