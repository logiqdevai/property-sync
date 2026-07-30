import { ApiProperty } from '@nestjs/swagger';
import { TranslationProvider } from 'generated/prisma';

export class PlatformConfig {
  @ApiProperty()
  id: string;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_max_pages: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_page_timeout_ms: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_selector_timeout_ms: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_scroll_pause_ms: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_detail_concurrency: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_detail_delay_ms: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_worker_concurrency: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_job_timeout_ms: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  crawler_chromium_max_contexts_before_restart: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  normalization_ai_raw_description_max_chars: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  dewatermark_cost_per_image: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  google_translate_cost_per_million_chars: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Null means the default value is used',
  })
  azure_translate_cost_per_million_chars: number | null;

  @ApiProperty({
    nullable: true,
    enum: TranslationProvider,
    description: 'Null means the default value is used',
  })
  translation_provider: TranslationProvider | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
