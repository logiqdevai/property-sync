import { ApiProperty } from '@nestjs/swagger';
import { CmsSyncStatus } from 'generated/prisma';

export class CmsSyncRun {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty()
  crawl_run_id: string;

  @ApiProperty()
  user_integration_id: string;

  @ApiProperty({ enum: CmsSyncStatus, example: CmsSyncStatus.PENDING })
  status: CmsSyncStatus;

  @ApiProperty()
  attempt: number;

  @ApiProperty({ nullable: true })
  max_attempts: number | null;

  @ApiProperty()
  total_created: number;

  @ApiProperty()
  total_updated: number;

  @ApiProperty()
  total_removed: number;

  @ApiProperty({
    description:
      'Properties linked to an existing CMS listing without a push',
  })
  total_linked: number;

  @ApiProperty()
  total_failed: number;

  @ApiProperty({
    nullable: true,
    description: 'Batch payload with operations queued for CMS push',
  })
  payload: Record<string, unknown> | null;

  @ApiProperty({
    nullable: true,
    description:
      'Batch outcome including failed_property_ids and operation_results with per-property errors',
    example: {
      failed_property_ids: ['123e4567-e89b-12d3-a456-426614174000'],
      skipped_duplicate_property_ids: [],
      operation_results: [
        {
          user_property_id: '123e4567-e89b-12d3-a456-426614174000',
          operation: 'CREATE',
          success: false,
          property_title: 'Villa with sea view',
          error: 'VALIDATION_ERROR: Missing estateweb_type_id',
        },
      ],
    },
  })
  response: {
    failed_property_ids: string[];
    skipped_duplicate_property_ids: string[];
    operation_results: Array<{
      user_property_id: string;
      operation: string;
      success: boolean;
      property_title?: string | null;
      integration_property_id?: string | null;
      error?: string;
      reconciled?: boolean;
      skipped_push?: boolean;
    }>;
  } | null;

  @ApiProperty({ nullable: true })
  error_message: string | null;

  @ApiProperty({ nullable: true })
  started_at: Date | null;

  @ApiProperty({ nullable: true })
  finished_at: Date | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
