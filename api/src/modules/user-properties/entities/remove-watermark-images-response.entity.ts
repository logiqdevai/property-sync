import { ApiProperty } from '@nestjs/swagger';

export class RemoveWatermarkImagesResponseEntity {
  @ApiProperty()
  job_log_id: string;

  @ApiProperty()
  message: string;
}
