import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EstateWebSiteSelectionDto } from '@/modules/user-properties/dto/update-estateweb-sites.dto';
import { EstateWebIdentifierType } from '../interfaces/estateweb-bulk-identifier.interface';

export class AdminEstateWebBulkUpdateSitesDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    description:
      'EstateWeb "code" values or numeric property ids to resolve and update, depending on identifier_type',
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

  @ApiProperty({
    type: [EstateWebSiteSelectionDto],
    description:
      'Selected EstateWeb publish sites only. Send [] to unpublish from every site.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstateWebSiteSelectionDto)
  sites: EstateWebSiteSelectionDto[];
}
