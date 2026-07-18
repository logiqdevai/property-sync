import { ApiProperty } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

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

    @ApiProperty({
        required: false,
        type: [String],
        description:
            'Substrings removed from title/description before creating the user property',
        example: ['Agency footer text', 'Call us at'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    @MaxLength(2000, { each: true })
    text_truncate_pieces?: string[];
}
