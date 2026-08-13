import { EstateWebPropertySite } from '@/integrations/estateweb/interfaces/estateweb-property.interface';

export interface EstateWebBulkSitesByCodesJobData {
  job_log_id: string;
  user_integration_id: string;
  code: string;
  property_id: number;
  total: number;
  sites: EstateWebPropertySite[];
}

export interface EstateWebBulkSitesByCodesItemResult {
  code: string;
  property_id: number | null;
  status: 'updated' | 'failed';
  error?: string;
}

export interface EstateWebBulkSitesByCodesJobResult {
  total: number;
  processed: number;
  updated: number;
  failed: number;
  items: EstateWebBulkSitesByCodesItemResult[];
  logs?: string[];
}
