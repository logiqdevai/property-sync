import { ApiProperty } from '@nestjs/swagger';
import { CostOperationType, IntegrationType } from 'generated/prisma';

export class CostLog {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ nullable: true })
  user_id: string | null;

  @ApiProperty({ enum: CostOperationType })
  operation_type: CostOperationType;

  @ApiProperty({ enum: IntegrationType })
  provider: IntegrationType;

  @ApiProperty({ nullable: true })
  model: string | null;

  @ApiProperty({ nullable: true })
  input_quantity: number | null;

  @ApiProperty({ nullable: true })
  output_quantity: number | null;

  @ApiProperty({ nullable: true })
  unit_count: number | null;

  @ApiProperty({ nullable: true })
  input_cost: string | null;

  @ApiProperty({ nullable: true })
  output_cost: string | null;

  @ApiProperty()
  total_cost: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ nullable: true })
  crawl_run_id: string | null;

  @ApiProperty({ nullable: true })
  user_property_id: string | null;

  @ApiProperty({ nullable: true })
  user_tracked_agency_id: string | null;

  @ApiProperty({ nullable: true })
  ai_batch_run_id: string | null;

  @ApiProperty({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  created_at: Date;
}
