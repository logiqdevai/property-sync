import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class BulkSetAiBatchDto {
  @ApiProperty({
    description:
      'Whether title generation should use the OpenAI Batch API, applied across every agency this user has a content publishing config for',
  })
  @IsBoolean()
  use_ai_batch: boolean;
}
