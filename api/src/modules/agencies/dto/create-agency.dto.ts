import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ContentLanguage } from 'generated/prisma';
import { BlockRuleDto } from './block-rule.dto';

export class CreateAgencyDto {
  @ApiProperty({
    description: 'Agency display name',
    example: 'Acme Real Estate',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    description: 'Root URL of the agency website',
    example: 'https://acme-realestate.com',
  })
  @IsUrl()
  base_url: string;

  @ApiProperty({ required: false, example: 'GR' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false, example: 'Athens' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    required: false,
    description:
      'Default cron expression for scraping jobs (5 space-separated fields)',
    example: '0 */6 * * *',
    default: '0 */6 * * *',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(\S+\s+){4}\S+$/, {
    message: 'crawl_interval must be a valid 5-field cron expression',
  })
  crawl_interval?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Visible for scraper/crawl setup',
  })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Visible/trackable by end users',
  })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'When true, scheduled crawl normalization uses the OpenAI Batch API',
  })
  @IsOptional()
  @IsBoolean()
  use_ai_batching?: boolean;

  @ApiProperty({
    required: false,
    enum: ContentLanguage,
    default: ContentLanguage.EL,
    description: 'Authored language of scraped titles/descriptions',
  })
  @IsOptional()
  @IsEnum(ContentLanguage)
  content_language?: ContentLanguage;

  @ApiProperty({
    required: false,
    description:
      'Override for the default page-ready wait budget used by all block/challenge checks (ms). Leave unset to use the built-in default.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  block_handling_wait_timeout_ms?: number;

  @ApiProperty({
    required: false,
    description:
      'Override for the "page looks loaded" body-length heuristic (characters). Leave unset to use the built-in default.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  block_handling_min_ready_body_length?: number;

  @ApiProperty({
    required: false,
    type: [BlockRuleDto],
    description:
      'Extra bot-block/challenge detection rules for this agency, merged with the built-in defaults. Leave unset (or empty) if the site has no protections beyond the generic defaults.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockRuleDto)
  block_rules?: BlockRuleDto[];
}
