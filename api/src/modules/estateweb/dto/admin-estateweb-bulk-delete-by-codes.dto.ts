import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { EstateWebIdentifierType } from '../interfaces/estateweb-bulk-identifier.interface';

export class AdminEstateWebBulkDeleteByCodesDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    description:
      'EstateWeb "code" values or numeric property ids to resolve and delete, depending on identifier_type',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  identifiers: string[];

  @ApiProperty({
    enum: ['code', 'id'],
    default: 'code',
    required: false,
    description:
      'Whether "identifiers" are EstateWeb "code" values or numeric EstateWeb property ids (from the property URL) -- codes are ambiguous when duplicate properties share one, ids are not',
  })
  @IsOptional()
  @IsIn(['code', 'id'])
  identifier_type?: EstateWebIdentifierType;
}
