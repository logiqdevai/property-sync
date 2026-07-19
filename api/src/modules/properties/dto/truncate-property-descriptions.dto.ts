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
    description: 'Exact text to find in each property title and description',
  })
  @IsString()
  @MinLength(1)
  text: string;

  @ApiPropertyOptional({
    description:
      'Optional replacement for matched text. Omit or leave empty to remove.',
  })
  @IsOptional()
  @IsString()
  replacement?: string;
}
