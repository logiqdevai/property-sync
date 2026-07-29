import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ContentLanguage,
  DescriptionProductionStrategy,
  TitleProductionStrategy,
} from 'generated/prisma';

export class AiTitleFamilyEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  config_id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  model: string | null;

  @ApiPropertyOptional({ nullable: true })
  use_batch: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  instructions: string | null;

  @ApiProperty()
  is_enabled: boolean;

  @ApiProperty({ type: [String], enum: ContentLanguage })
  assigned_languages: ContentLanguage[];
}

export class ContentOutputEntity {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ContentLanguage })
  language: ContentLanguage;

  @ApiProperty({ enum: TitleProductionStrategy })
  title_strategy: TitleProductionStrategy;

  @ApiProperty({ enum: DescriptionProductionStrategy })
  description_strategy: DescriptionProductionStrategy;

  @ApiPropertyOptional({ nullable: true })
  ai_title_family_id: string | null;

  @ApiPropertyOptional({ nullable: true })
  ai_title_family_name: string | null;
}

export class ContentPublishingConfigEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_tracked_agency_id: string;

  @ApiProperty()
  ai_titles_enabled: boolean;

  @ApiProperty()
  use_ai_batch: boolean;

  @ApiProperty()
  is_enabled: boolean;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiProperty({ enum: ContentLanguage })
  source_language: ContentLanguage;

  @ApiProperty({ type: [AiTitleFamilyEntity] })
  ai_title_families: AiTitleFamilyEntity[];

  @ApiProperty({ type: [ContentOutputEntity] })
  outputs: ContentOutputEntity[];
}
