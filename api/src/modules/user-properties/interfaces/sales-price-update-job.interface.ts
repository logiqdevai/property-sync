export interface SalesPriceUpdateJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
}

export type SalesPriceUpdateItemStatus = 'updated' | 'failed';

export interface SalesPriceUpdateItemResult {
  user_property_id: string;
  status: SalesPriceUpdateItemStatus;
  error?: string;
}

export interface SalesPriceUpdateJobResult {
  total: number;
  processed: number;
  updated: number;
  failed: number;
  items: SalesPriceUpdateItemResult[];
  logs?: string[];
}
