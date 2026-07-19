import { ApiProperty } from '@nestjs/swagger';
import { CrawlRunStatus } from 'generated/prisma';

export class CrawlRun {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty()
  source_agency_id: string;

  @ApiProperty({ nullable: true })
  scraper_id: string | null;

  @ApiProperty({ nullable: true })
  user_tracked_agency_id: string | null;

  @ApiProperty({ enum: CrawlRunStatus, example: CrawlRunStatus.QUEUED })
  status: CrawlRunStatus;

  @ApiProperty({ nullable: true })
  started_at: Date | null;

  @ApiProperty({ nullable: true })
  finished_at: Date | null;

  @ApiProperty({ nullable: true })
  duration_ms: number | null;

  @ApiProperty()
  total_found: number;

  @ApiProperty({
    description: 'Of total_found, how many were brand-new listings this scrape',
  })
  total_new_listings: number;

  @ApiProperty({
    description:
      'Of total_found, how many were already-known listings re-seen this scrape',
  })
  total_refreshed_listings: number;

  @ApiProperty({
    description:
      'Sum of cms_sync_runs.total_created across every user for this run',
  })
  total_created: number;

  @ApiProperty({
    description:
      'Sum of cms_sync_runs.total_updated across every user for this run',
  })
  total_updated: number;

  @ApiProperty({
    description:
      'Sum of cms_sync_runs.total_removed across every user for this run',
  })
  total_removed: number;

  @ApiProperty({
    description:
      'Sum of cms_sync_runs.total_failed across every user for this run',
  })
  total_failed: number;

  @ApiProperty({ nullable: true })
  error_message: string | null;

  @ApiProperty({ nullable: true })
  ai_model: string | null;

  @ApiProperty({ nullable: true })
  ai_input_tokens: number | null;

  @ApiProperty({ nullable: true })
  ai_output_tokens: number | null;

  @ApiProperty({ nullable: true })
  ai_input_cost: string | null;

  @ApiProperty({ nullable: true })
  ai_output_cost: string | null;

  @ApiProperty({ nullable: true })
  ai_total_cost: string | null;

  @ApiProperty({ nullable: true })
  ai_average_cost_per_property: string | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
