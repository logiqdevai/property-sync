export interface EstateWebSitesUpdateSite {
  selected: true;
  name: string;
  agent_site_id: number;
  show_on_slider: 0 | 1;
  show_on_first_page: 0 | 1;
  show_on_relative_pages: 0 | 1;
}

export interface EstateWebSitesUpdateJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
  sites: EstateWebSitesUpdateSite[];
}

export type EstateWebSitesUpdateItemStatus = 'updated' | 'failed';

export interface EstateWebSitesUpdateItemResult {
  user_property_id: string;
  status: EstateWebSitesUpdateItemStatus;
  error?: string;
}

export interface EstateWebSitesUpdateJobResult {
  total: number;
  processed: number;
  updated: number;
  failed: number;
  items: EstateWebSitesUpdateItemResult[];
  logs?: string[];
}
