import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateTrackerAdminSettingsDto {
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
