import { MigrateIntegrationImagesMode } from '../dto/migrate-integration-images.dto';

export interface MigrateIntegrationImagesJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  mode: MigrateIntegrationImagesMode;
  total: number;
}

export type MigrateIntegrationImagesItemStatus =
  | 'migrated'
  | 'skipped'
  | 'failed';

export interface MigrateIntegrationImagesItemResult {
  user_property_id: string;
  status: MigrateIntegrationImagesItemStatus;
  error?: string;
}

export interface MigrateIntegrationImagesJobResult {
  total: number;
  processed: number;
  migrated: number;
  skipped: number;
  failed: number;
  items: MigrateIntegrationImagesItemResult[];
  logs?: string[];
}
