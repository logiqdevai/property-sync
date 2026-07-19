import { ApiProperty } from '@nestjs/swagger';

export type ActivityFeedType =
  | 'crawl'
  | 'crawl_failed'
  | 'listing_created'
  | 'listing_removed'
  | 'scraper_broken'
  | 'generation';

export class DashboardKpis {
  @ApiProperty()
  scrapers_total: number;

  @ApiProperty()
  scrapers_active: number;

  @ApiProperty()
  scrapers_broken: number;

  @ApiProperty()
  agencies_total: number;

  @ApiProperty()
  agencies_active: number;

  @ApiProperty()
  agencies_disabled: number;

  @ApiProperty()
  agencies_archived: number;

  @ApiProperty()
  running_crawls: number;

  @ApiProperty()
  failed_crawls_24h: number;

  @ApiProperty({ nullable: true })
  last_crawl_at: Date | null;

  @ApiProperty()
  properties_imported_today: number;

  @ApiProperty()
  properties_updated_today: number;

  @ApiProperty()
  properties_removed_today: number;

  @ApiProperty()
  failed_properties_today: number;

  @ApiProperty()
  properties_total: number;

  @ApiProperty()
  queue_waiting: number;

  @ApiProperty()
  queue_active: number;

  @ApiProperty()
  queue_failed: number;

  @ApiProperty()
  active_generation_runs: number;

  @ApiProperty()
  active_integrations: number;

  @ApiProperty()
  total_integrations: number;

  @ApiProperty()
  unread_notifications: number;
}

export class ActivityFeedItem {
  @ApiProperty({
    enum: [
      'crawl',
      'crawl_failed',
      'listing_created',
      'listing_removed',
      'scraper_broken',
      'generation',
    ],
  })
  type: ActivityFeedType;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  summary: string;

  @ApiProperty({ required: false })
  crawl_run_id?: string;

  @ApiProperty({ required: false })
  generation_run_id?: string;

  @ApiProperty({ required: false })
  scraper_id?: string;

  @ApiProperty({ required: false })
  property_id?: string;

  @ApiProperty({ required: false })
  source_agency_id?: string;
}

export class DashboardResponse {
  @ApiProperty({ type: DashboardKpis })
  kpis: DashboardKpis;

  @ApiProperty({ type: [ActivityFeedItem] })
  activity: ActivityFeedItem[];
}
