export interface RenormalizationJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
}

export type RenormalizationItemStatus = 'normalized' | 'failed';

export interface RenormalizationItemResult {
  user_property_id: string;
  status: RenormalizationItemStatus;
  error?: string;
}

export interface RenormalizationJobResult {
  total: number;
  processed: number;
  normalized: number;
  failed: number;
  items: RenormalizationItemResult[];
  logs?: string[];
}
