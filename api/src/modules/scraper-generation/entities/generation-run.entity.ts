import { ApiProperty } from '@nestjs/swagger';
import { GenerationRunStatus, GenerationTrigger } from 'generated/prisma';
import { ComputerUseStep } from './computer-use-step.entity';

export class ScraperGenerationRun {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty()
  source_agency_id: string;

  @ApiProperty({ nullable: true })
  scraper_id: string | null;

  @ApiProperty({ enum: GenerationTrigger, example: GenerationTrigger.MANUAL })
  trigger: GenerationTrigger;

  @ApiProperty({
    enum: GenerationRunStatus,
    example: GenerationRunStatus.QUEUED,
  })
  status: GenerationRunStatus;

  @ApiProperty({ nullable: true })
  prompt: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Draft config produced by the model, pending review',
  })
  staged_config: Record<string, unknown> | null;

  @ApiProperty({ nullable: true })
  produced_version_id: string | null;

  @ApiProperty({ nullable: true })
  error_message: string | null;

  @ApiProperty({ nullable: true })
  started_at: Date | null;

  @ApiProperty({ nullable: true })
  finished_at: Date | null;

  @ApiProperty({ nullable: true })
  duration_ms: number | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty({
    required: false,
    type: [ComputerUseStep],
    description: 'Present on GET /admin/generation-runs/:id, ordered by step_index asc',
  })
  steps?: ComputerUseStep[];

  @ApiProperty({
    required: false,
    description: 'Present on list/detail views',
    example: { name: 'Acme Real Estate' },
  })
  source_agency?: { name: string };

  @ApiProperty({
    required: false,
    description: 'Present on list/detail views when scraper_id is set',
    example: { name: 'Acme listing scraper' },
  })
  scraper?: { name: string } | null;
}
