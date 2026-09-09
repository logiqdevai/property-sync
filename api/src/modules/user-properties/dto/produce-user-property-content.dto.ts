import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class ProduceUserPropertyContentDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiPropertyOptional({
    description: 'Run Google Translate for TRANSLATE output slots',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  run_translations?: boolean;

  @ApiPropertyOptional({
    description: 'Run AI title families for AI title slots',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  run_ai_titles?: boolean;

  @ApiPropertyOptional({
    description:
      'Use OpenAI Batch API for AI titles (cheaper, deferred). When false, generate sync in multi-property chat calls.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  use_ai_batch?: boolean;

  @ApiPropertyOptional({
    description: 'Mark existing localized content stale before regenerating',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;

  @ApiPropertyOptional({
    description:
      'After successful production, also push language ads to EstateWeb CRM (separate from the dedicated Push to CRM action; requires the property already be linked to a CMS property, otherwise that property is reported as cms_failed even though its content was produced)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  push_to_crm?: boolean;
}
