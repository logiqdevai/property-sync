import { ApiProperty } from '@nestjs/swagger';
import { JobStatus } from 'generated/prisma';

export class JobLog {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty()
  queue_name: string;

  @ApiProperty({ nullable: true })
  job_id: string | null;

  @ApiProperty({ nullable: true })
  job_name: string | null;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiProperty()
  attempt: number;

  @ApiProperty({ nullable: true })
  max_attempts: number | null;

  @ApiProperty({ nullable: true })
  crawl_run_id: string | null;

  @ApiProperty({ nullable: true })
  payload: Record<string, unknown> | null;

  @ApiProperty({ nullable: true })
  result: Record<string, unknown> | null;

  @ApiProperty({ nullable: true })
  error_message: string | null;

  @ApiProperty({ nullable: true })
  stack_trace: string | null;

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
}
