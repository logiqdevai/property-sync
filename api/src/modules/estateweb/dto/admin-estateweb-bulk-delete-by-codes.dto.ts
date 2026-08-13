import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class AdminEstateWebBulkDeleteByCodesDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    description: 'EstateWeb "code" values to resolve and delete',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  codes: string[];
}
