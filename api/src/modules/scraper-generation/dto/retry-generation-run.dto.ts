import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Optional override for max computer-use steps on retry. Omit to keep the run value; null clears the limit.',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_steps?: number;
}
