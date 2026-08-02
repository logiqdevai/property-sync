import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { BlockRuleSource, BlockSignal } from 'generated/prisma';

const BLOCK_SIGNALS = ['BLOCKED', 'CHALLENGE'] as const;
const BLOCK_RULE_SOURCES = [
  'TITLE',
  'TEXT',
  'HTML',
  'PATH',
  'SCRIPT_CONTENT',
  'SELECTOR',
] as const;

export class BlockRuleDto {
  @ApiProperty({
    required: false,
    description: 'Human-readable name shown in the admin UI',
    example: 'CloudFront token challenge',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({
    enum: BLOCK_SIGNALS,
    description:
      'BLOCKED = stop immediately (hard error page). CHALLENGE = keep waiting for the page to clear itself.',
    example: 'CHALLENGE',
  })
  @IsIn(BLOCK_SIGNALS)
  signal: BlockSignal;

  @ApiProperty({
    enum: BLOCK_RULE_SOURCES,
    description: 'Which part of the page `pattern` is tested against',
    example: 'PATH',
  })
  @IsIn(BLOCK_RULE_SOURCES)
  source: BlockRuleSource;

  @ApiProperty({
    description:
      'Substring (or regex source when is_regex is set) to match against `source`. CSS selector when source = SELECTOR.',
    example: '69616d7761746368696e67796f75',
  })
  @IsString()
  @MinLength(1)
  pattern: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Treat `pattern` as a regular expression instead of a plain substring',
  })
  @IsOptional()
  @IsBoolean()
  is_regex?: boolean;

  @ApiProperty({
    required: false,
    description: 'Regex flags, used only when is_regex is true (defaults to "i")',
    example: 'i',
  })
  @IsOptional()
  @IsString()
  regex_flags?: string;
}
