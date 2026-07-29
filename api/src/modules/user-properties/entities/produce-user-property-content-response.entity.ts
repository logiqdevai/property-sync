import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProduceUserPropertyContentSkippedItemEntity {
  @ApiProperty()
  user_property_id: string;

  @ApiProperty()
  error: string;
}

export class ProduceUserPropertyContentResponseEntity {
  @ApiProperty()
  job_log_id: string;

  @ApiProperty()
  enqueued: number;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional({ type: [ProduceUserPropertyContentSkippedItemEntity] })
  skipped?: ProduceUserPropertyContentSkippedItemEntity[];
}
