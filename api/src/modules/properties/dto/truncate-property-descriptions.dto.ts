import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, IsUUID, MinLength } from 'class-validator';

export class TruncatePropertyDescriptionsDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  property_ids: string[];

  @ApiProperty({
    description: 'Exact text to remove from each property title and description',
  })
  @IsString()
  @MinLength(1)
  text: string;
}
