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

  @ApiProperty()
  total_failed: number;

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
