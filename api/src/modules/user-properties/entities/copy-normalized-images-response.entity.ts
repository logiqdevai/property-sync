import { ApiProperty } from '@nestjs/swagger';

export class CopyNormalizedImagesResponseEntity {
  @ApiProperty()
  job_log_id: string;

  @ApiProperty()
  message: string;
}
