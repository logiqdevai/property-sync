import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DuplicateScraperDto {
  @ApiProperty({
    description: 'Agency to create the duplicated scraper for',
  })
  @IsUUID()
  source_agency_id: string;
}
