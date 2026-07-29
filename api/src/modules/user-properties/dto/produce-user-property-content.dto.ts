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
      'After successful production, enqueue EstateWeb CRM sync so language ads update',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  push_to_crm?: boolean;
}
