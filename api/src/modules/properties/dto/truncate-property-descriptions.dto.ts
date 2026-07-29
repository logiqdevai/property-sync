import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class TruncatePropertyDescriptionsDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  property_ids: string[];

  @ApiProperty({
    type: [String],
    minItems: 1,
    description:
      'Exact texts (or encoded patterns) to find in each property title and description',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  texts: string[];

  @ApiPropertyOptional({
    description:
      'Optional replacement for matched text. Omit or leave empty to remove.',
  })
  @IsOptional()
  @IsString()
  replacement?: string;
}
