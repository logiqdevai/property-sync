import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpdateTrackerAdminSettingsDto {
    @ApiProperty({ required: false, description: 'Cron expression (5 space-separated fields)', example: '0 */6 * * *' })
    @IsOptional()
    @IsString()
    @Matches(/^(\S+\s+){4}\S+$/, { message: 'crawl_interval must be a valid 5-field cron expression' })
    crawl_interval?: string;

    @ApiProperty({ required: false, minimum: 1, example: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    concurrent_insertions?: number;

    @ApiProperty({ required: false, minimum: 1, example: 5 })
    @IsOptional()
    @IsInt()
    @Min(1)
    insertion_interval_minutes?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    use_ai_batching?: boolean;
}
