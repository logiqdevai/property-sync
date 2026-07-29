import { ApiProperty } from '@nestjs/swagger';

export class ProduceUserPropertyContentFailedItemEntity {
  @ApiProperty()
  user_property_id: string;

  @ApiProperty()
  error: string;
}

export class ProduceUserPropertyContentResponseEntity {
  @ApiProperty()
  ready_count: number;

  @ApiProperty()
  pending_batch_count: number;

  @ApiProperty({ type: [String] })
  ready_ids: string[];

  @ApiProperty({ type: [String] })
  pending_batch_ids: string[];

  @ApiProperty()
  translations_written: number;

  @ApiProperty()
  titles_written: number;

  @ApiProperty({ description: 'Number of properties successfully pushed to CMS' })
  cms_queued: number;

  @ApiProperty({ type: [ProduceUserPropertyContentFailedItemEntity] })
  failed: ProduceUserPropertyContentFailedItemEntity[];

  @ApiProperty({ type: [ProduceUserPropertyContentFailedItemEntity] })
  cms_failed: ProduceUserPropertyContentFailedItemEntity[];
}
