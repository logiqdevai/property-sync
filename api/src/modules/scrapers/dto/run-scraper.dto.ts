import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class RunScraperDto {
  @ApiProperty({
    required: false,
    description:
      'Skip the removal-spike safety net (incomplete-crawl coverage check and the spike notification) for this run only. Only set this when a large drop in listings is known/confirmed to be legitimate (e.g. the agency did a real listings cleanup) -- it lets every missing listing be marked REMOVED without the usual guardrail.',
  })
  @IsOptional()
  @IsBoolean()
  skip_spike_check?: boolean;
}
