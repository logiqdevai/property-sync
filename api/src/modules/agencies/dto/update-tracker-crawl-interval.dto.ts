import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class UpdateTrackerCrawlIntervalDto {
    @ApiProperty({ description: 'Cron expression (5 space-separated fields)', example: '0 */6 * * *' })
    @IsString()
    @Matches(/^(\S+\s+){4}\S+$/, { message: 'crawl_interval must be a valid 5-field cron expression' })
    crawl_interval: string;
}
