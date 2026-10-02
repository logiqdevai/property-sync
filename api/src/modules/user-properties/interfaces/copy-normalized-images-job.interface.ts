export interface CopyNormalizedImagesJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  source_urls: string[];
  remove_watermark: boolean;
}

export type CopyNormalizedImagesItemStatus = 'copied' | 'failed';

export interface CopyNormalizedImagesItemResult {
  source_url: string;
  status: CopyNormalizedImagesItemStatus;
  error?: string;
}

export interface CopyNormalizedImagesJobResult {
  total: number;
  processed: number;
  copied: number;
  failed: number;
  items: CopyNormalizedImagesItemResult[];
  logs?: string[];
}
