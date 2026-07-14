import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class MergePropertiesDto {
  @ApiProperty({ type: [String], minItems: 2 })
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  property_ids: string[];
}
