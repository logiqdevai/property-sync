export interface StaleCrmImagesReplaceJobData {
  job_log_id: string;
  user_property_id: string;
  user_integration_id: string;
  crm_property_id: string;
  crm_image_id: number;
  new_source_image: string;
  position: number;
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
  total: number;
}

export interface StaleCrmImagesReplaceItemResult {
  user_property_id: string;
  crm_image_id: number;
  status: 'replaced' | 'failed';
  error?: string;
}

export interface StaleCrmImagesReplaceJobResult {
  total: number;
  processed: number;
  replaced: number;
  failed: number;
  items: StaleCrmImagesReplaceItemResult[];
  logs?: string[];
}
