import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

// Every field is nullable: null explicitly resets that setting back to its
// in-code default (see PlatformConfigService.getCrawlerConfig), omitting
// a field leaves it unchanged. Fields are grouped by subsystem prefix
// (crawler_*, and more subsystems over time) -- all sharing this one row.
export class UpdatePlatformConfigDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Max listing pages to paginate through per crawl',
    example: 50,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  crawler_max_pages?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Timeout (ms) for page navigation/load',
    example: 30_000,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  crawler_page_timeout_ms?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Timeout (ms) waiting for the listing selector to appear',
    example: 15_000,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  crawler_selector_timeout_ms?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Pause (ms) between infinite-scroll/load-more steps',
    example: 1_500,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  crawler_scroll_pause_ms?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Number of detail pages enriched concurrently',
    example: 3,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  crawler_detail_concurrency?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Delay (ms) between detail-enrichment batches',
    example: 500,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  crawler_detail_delay_ms?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Number of crawl jobs processed concurrently by the worker',
    example: 5,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  crawler_worker_concurrency?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Timeout (ms) for a single crawl/enrichment job',
    example: 1_800_000,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  crawler_job_timeout_ms?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Browser contexts created before recycling the shared Chromium instance',
    example: 250,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  crawler_chromium_max_contexts_before_restart?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Max characters of raw_description sent to AI during normalization (full text still stored on Property)',
    example: 2000,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(100)
  normalization_ai_raw_description_max_chars?: number | null;
}
