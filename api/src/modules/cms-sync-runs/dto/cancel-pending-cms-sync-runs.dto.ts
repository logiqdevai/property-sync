import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CancelPendingCmsSyncRunsDto {
  @ApiProperty({ type: String })
  @IsUUID('4')
  source_agency_id: string;
}
