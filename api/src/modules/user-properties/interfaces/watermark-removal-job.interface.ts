export interface WatermarkRemovalJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  user_integration_id: string;
  crm_property_id: string;
  image_ids: string[];
  replace_crm_images: boolean;
}

export type WatermarkRemovalImageStatus = 'completed' | 'failed';

export type WatermarkRemovalStepStatus =
  | 'started'
  | 'ok'
  | 'failed'
  | 'skipped';

export interface WatermarkRemovalStepLog {
  step: string;
  status: WatermarkRemovalStepStatus;
  duration_ms?: number;
  detail?: string;
  error?: string;
}

export interface WatermarkRemovalImageResult {
  image_id: string;
  status: WatermarkRemovalImageStatus;
  error?: string;
  steps?: WatermarkRemovalStepLog[];
}

export interface WatermarkRemovalJobResult {
  total: number;
  completed: number;
  failed: number;
  items: WatermarkRemovalImageResult[];
  logs?: string[];
}
