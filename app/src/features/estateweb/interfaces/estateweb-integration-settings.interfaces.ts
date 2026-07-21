export interface EstateWebPushSiteSetting {
  selected: boolean;
  name: string;
  agent_site_id: number;
  show_on_slider: 0 | 1;
  show_on_first_page: 0 | 1;
  show_on_relative_pages: 0 | 1;
}

export interface EstateWebIntegrationSettings {
  estateweb_default_sites: EstateWebPushSiteSetting[];
}
