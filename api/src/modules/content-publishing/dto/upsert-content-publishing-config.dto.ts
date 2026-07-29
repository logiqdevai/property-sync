import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ContentLanguage,
  DescriptionProductionStrategy,
  TitleProductionStrategy,
} from 'generated/prisma';

export class UpsertAiTitleFamilyDto {
  @ApiProperty({ example: 'Primary markets' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string | null;

  @ApiPropertyOptional({
    description: 'null inherits ContentPublishingConfig.use_ai_batch',
  })
  @IsOptional()
  @IsBoolean()
  use_batch?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string | null;

  @ApiPropertyOptional({
    enum: ContentLanguage,
    description:
      'Language all titles in this family must be written in (e.g. EN for EN+IT EstateWeb slots, EL for EL/DE/FR/RU slots)',
  })
  @IsOptional()
  @IsEnum(ContentLanguage)
  writing_language?: ContentLanguage | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

export class UpsertContentOutputDto {
  @ApiProperty({ enum: ContentLanguage })
  @IsEnum(ContentLanguage)
  language: ContentLanguage;

  @ApiProperty({ enum: TitleProductionStrategy })
  @IsEnum(TitleProductionStrategy)
  title_strategy: TitleProductionStrategy;

  @ApiProperty({ enum: DescriptionProductionStrategy })
  @IsEnum(DescriptionProductionStrategy)
  description_strategy: DescriptionProductionStrategy;

  @ApiPropertyOptional({
    enum: ContentLanguage,
    nullable: true,
    description:
      'Language of derived description text. Defaults to slot language. Set EN on IT slot to reuse English translation.',
  })
  @IsOptional()
  @IsEnum(ContentLanguage)
  description_content_language?: ContentLanguage | null;

  @ApiPropertyOptional({
    description: 'Required when title_strategy is AI; family name within config',
  })
  @ValidateIf((o: UpsertContentOutputDto) => o.title_strategy === 'AI')
  @IsString()
  @MinLength(1)
  ai_title_family?: string | null;
}

export class UpsertContentPublishingConfigDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  ai_titles_enabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  use_ai_batch?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiProperty({ type: [UpsertAiTitleFamilyDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertAiTitleFamilyDto)
  ai_title_families: UpsertAiTitleFamilyDto[];

  @ApiProperty({ type: [UpsertContentOutputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertContentOutputDto)
  outputs: UpsertContentOutputDto[];
}
