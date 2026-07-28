export interface IntegrationPropertyImage {
  id: number;
  path: string;
  filename: string;
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
  url?: string;
  source_image?: string;
}

export interface IntegrationPropertySite {
  selected: boolean;
  name: string;
  agent_site_id: number;
  show_on_slider: 0 | 1;
  show_on_first_page: 0 | 1;
  show_on_relative_pages: 0 | 1;
}

export interface IntegrationProperty {
  id: string;
  user_id: string;
  user_integration_settings_id: string;
  user_property_id: string;
  images: IntegrationPropertyImage[] | null;
  sites: IntegrationPropertySite[] | null;
  created_at: string;
  updated_at: string;
}
