import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, Matches, MinLength } from 'class-validator';

export class CreateAgencyDto {
    @ApiProperty({ description: 'Agency display name', example: 'Acme Real Estate' })
    @IsString()
    @MinLength(1)
    name: string;

    @ApiProperty({ description: 'Root URL of the agency website', example: 'https://acme-realestate.com' })
    @IsUrl()
    base_url: string;

    @ApiProperty({ required: false, example: 'GR' })
    @IsOptional()
    @IsString()
    country?: string;

    @ApiProperty({ required: false, example: 'Athens' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiProperty({
        required: false,
        description: 'Default cron expression for scraping jobs (5 space-separated fields)',
        example: '0 */6 * * *',
        default: '0 */6 * * *',
    })
    @IsOptional()
    @IsString()
    @Matches(/^(\S+\s+){4}\S+$/, { message: 'crawl_interval must be a valid 5-field cron expression' })
    crawl_interval?: string;

    @ApiProperty({ required: false, default: false, description: 'Visible for scraper/crawl setup' })
    @IsOptional()
    @IsBoolean()
    is_visible?: boolean;

    @ApiProperty({ required: false, default: false, description: 'Visible/trackable by end users' })
    @IsOptional()
    @IsBoolean()
    is_enabled?: boolean;
}
