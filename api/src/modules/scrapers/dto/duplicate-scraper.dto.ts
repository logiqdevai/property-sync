import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DuplicateScraperDto {
  @ApiProperty({
    description:
      "Agency to create the duplicated scraper for. Its own base_url (that agency's real listings URL) is used as the new scraper's start_url -- the source scraper's start_url is never carried over, since it belongs to a different site.",
  })
  @IsUUID()
  source_agency_id: string;
}
