import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';
import { EstateWebSiteSelectionDto } from '@/modules/user-properties/dto/update-estateweb-sites.dto';

export class AdminEstateWebBulkUpdateSitesDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    description: 'EstateWeb "code" values to resolve and update',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  codes: string[];

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
