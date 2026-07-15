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

  @ApiProperty()
  total_created: number;

  @ApiProperty()
  total_updated: number;

  @ApiProperty()
  total_removed: number;

  @ApiProperty()
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
