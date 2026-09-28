import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class ResumeCrawlDto {
  @ApiProperty({
    required: false,
    description:
      "Start the listing walk from this URL instead of the scraper's start_url (must be on the scraper's own site). The run is treated as partial: listings on pages before it are NOT marked removed.",
  })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  start_url?: string;

  @ApiProperty({
    required: false,
    description:
      'For url_param pagination only: start the listing walk at this page number. Use start_url for other pagination types. Cannot be combined with start_url.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  start_page?: number;

  @ApiProperty({
    required: false,
    description:
      'Reuse detail-page data (description, gallery, specs) fetched within the last N hours instead of re-fetching it, so the run only spends time on listings that still lack it.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  reuse_detail_hours?: number;
}
