import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAgencyVisibilityDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    is_visible: boolean;

    @ApiProperty({ required: false, example: true })
    @IsOptional()
    @IsBoolean()
    is_enabled?: boolean;
}
