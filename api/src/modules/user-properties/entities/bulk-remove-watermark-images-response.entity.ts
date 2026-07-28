import { ApiProperty } from '@nestjs/swagger';

export class BulkRemoveWatermarkImagesFailedItemEntity {
  @ApiProperty()
  user_property_id: string;

  @ApiProperty()
  error: string;
}

export class BulkRemoveWatermarkImagesResponseEntity {
  @ApiProperty({ type: [String] })
  job_log_ids: string[];

  @ApiProperty()
  enqueued: number;

  @ApiProperty({ type: [BulkRemoveWatermarkImagesFailedItemEntity] })
  failed: BulkRemoveWatermarkImagesFailedItemEntity[];

  @ApiProperty()
  message: string;
}
