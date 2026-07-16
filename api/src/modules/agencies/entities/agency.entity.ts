import { ApiProperty } from '@nestjs/swagger';

export class Agency {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
    id: string;

    @ApiProperty({ example: 'Acme Real Estate' })
    name: string;

    @ApiProperty({ example: 'https://acme-realestate.com' })
    base_url: string;

    @ApiProperty({ nullable: true, example: 'GR' })
    country: string | null;

    @ApiProperty({ nullable: true, example: 'Athens' })
    city: string | null;

    @ApiProperty()
    is_visible: boolean;

    @ApiProperty()
    is_enabled: boolean;

    @ApiProperty({ example: '0 */6 * * *' })
    crawl_interval: string;

    @ApiProperty({ nullable: true })
    notes: string | null;

    @ApiProperty({ nullable: true })
    last_success_at: Date | null;

    @ApiProperty({ nullable: true })
    last_failure_at: Date | null;

    @ApiProperty({ nullable: true })
    last_error_message: string | null;

    @ApiProperty()
    created_at: Date;

    @ApiProperty()
    updated_at: Date;

    @ApiProperty({
        required: false,
        description: 'Present on GET /admin/agencies/:id',
        example: { scrapers: 0, crawl_runs: 0, notifications: 0 },
    })
    _count?: {
        scrapers: number;
        crawl_runs: number;
        notifications: number;
    };

    @ApiProperty({
        required: false,
        description: 'Present on GET /admin/agencies/:id',
        type: 'array',
    })
    user_tracked_agencies?: Array<{
        id: string;
        user_id: string;
        source_agency_id: string;
        enabled: boolean;
        crawl_interval: string;
        concurrent_insertions: number;
        insertion_interval_minutes: number;
        track_new_listings: boolean;
        track_removed_listings: boolean;
        track_updated_listings: boolean;
        use_ai_batching: boolean;
        created_at: Date;
        updated_at: Date;
        user: {
            id: string;
            email: string;
            role: string;
        };
    }>;
}
