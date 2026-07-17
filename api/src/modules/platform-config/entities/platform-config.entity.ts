import { ApiProperty } from '@nestjs/swagger';

export class PlatformConfig {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_max_pages: number | null;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_page_timeout_ms: number | null;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_selector_timeout_ms: number | null;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_scroll_pause_ms: number | null;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_detail_concurrency: number | null;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_detail_delay_ms: number | null;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_worker_concurrency: number | null;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_job_timeout_ms: number | null;

  @ApiProperty({ nullable: true, description: 'Null means the default value is used' })
  crawler_chromium_max_contexts_before_restart: number | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
