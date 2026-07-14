import { ApiProperty } from '@nestjs/swagger';
import { ComputerActionType } from 'generated/prisma';

export class ComputerUseStep {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty()
  scraper_generation_run_id: string;

  @ApiProperty({ example: 0 })
  step_index: number;

  @ApiProperty({ enum: ComputerActionType, example: ComputerActionType.CLICK })
  action_type: ComputerActionType;

  @ApiProperty({
    description: 'Raw action returned by the model',
    example: { x: 320, y: 540 },
  })
  action_payload: Record<string, unknown>;

  @ApiProperty({
    nullable: true,
    description: 'Resolved GCS url of the screenshot taken before this action',
  })
  screenshot_before_url: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Resolved GCS url of the screenshot taken after this action',
  })
  screenshot_after_url: string | null;

  @ApiProperty({ nullable: true })
  model_reasoning: string | null;

  @ApiProperty()
  created_at: Date;
}
