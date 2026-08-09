import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsUUID } from 'class-validator';
import { PropertyStatus } from 'generated/prisma';

export class UpdateUserPropertyStatusDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ enum: PropertyStatus })
  @IsEnum(PropertyStatus)
  status: PropertyStatus;
}
