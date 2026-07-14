import { ApiProperty } from '@nestjs/swagger';
import { ScraperStatus, ScraperHealth } from 'generated/prisma';
import { ScraperVersion } from './scraper-version.entity';

export class Scraper {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty()
  source_agency_id: string;

  @ApiProperty({ example: 'Acme listing scraper' })
  name: string;

  @ApiProperty({ nullable: true })
  active_version_id: string | null;

  @ApiProperty({ example: 1 })
  version_count: number;

  @ApiProperty({ enum: ScraperStatus, example: ScraperStatus.TESTING })
  status: ScraperStatus;

  @ApiProperty()
  self_healing_enabled: boolean;

  @ApiProperty({ enum: ScraperHealth, example: ScraperHealth.GOOD })
  health: ScraperHealth;

  @ApiProperty({ nullable: true })
  success_rate: number | null;

  @ApiProperty({ nullable: true })
  avg_runtime_ms: number | null;

  @ApiProperty()
  consecutive_failures: number;

  @ApiProperty({ nullable: true })
  last_success_at: Date | null;

  @ApiProperty({ nullable: true })
  last_failure_at: Date | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty({
    required: false,
    type: ScraperVersion,
    description: 'Present on GET /admin/scrapers/:id',
  })
  active_version?: ScraperVersion | null;

  @ApiProperty({
    required: false,
    description: 'Present on list/detail views',
    example: { name: 'Acme Real Estate' },
  })
  source_agency?: { name: string };
}
