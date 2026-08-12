import { IntegrationType } from 'generated/prisma';
import { SyncForPropertyResult } from '@/modules/user-properties/user-properties.service';

export interface NormalizationChunkJobData {
  job_log_id: string;
  crawl_run_id: string;
  source_agency_id: string;
  crawl_started_at: string;
  // Resolves the AI key at process-time via resolveActiveApiKey — never the
  // key itself, so nothing secret sits in Redis/JobLog for however long the
  // job waits in queue, and a rotated key is picked up correctly on retry.
  tracker_user_id: string;
  user_tracked_agency_id?: string;
  scraper_id?: string;
  provider: IntegrationType;
  model: string;
  source_property_ids: string[];
  chunk_index: number;
  total_chunks: number;
}

export type NormalizationChunkStatus = 'normalized' | 'failed';

export interface NormalizationChunkItemResult {
  chunk_index: number;
  status: NormalizationChunkStatus;
  normalized_count: number;
  fallback_count: number;
  created_count: number;
  input_tokens: number;
  output_tokens: number;
  error?: string;
}

export interface NormalizationChunkJobResult {
  total: number;
  processed: number;
  chunks: NormalizationChunkItemResult[];
  affected: SyncForPropertyResult[];
  created_count: number;
  finalized: boolean;
  logs?: string[];
}
