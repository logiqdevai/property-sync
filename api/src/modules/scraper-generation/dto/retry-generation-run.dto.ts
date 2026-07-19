import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RetryGenerationRunDto {
  @ApiProperty({
    required: false,
    description:
      'Failure context for the model. Defaults to the run stored error_message when omitted.',
  })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiProperty({
    required: false,
    description:
      'Optional extra instructions appended to the run prompt before resuming.',
  })
  @IsOptional()
  @IsString()
  prompt?: string;
}
