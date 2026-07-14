import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RejectGenerationRunDto {
  @ApiProperty({ required: false, description: 'Why the run was rejected' })
  @IsOptional()
  @IsString()
  reason?: string;
}
