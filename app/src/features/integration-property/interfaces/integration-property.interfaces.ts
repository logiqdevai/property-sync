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

export interface IntegrationProperty {
  id: string;
  user_id: string;
  user_integration_settings_id: string;
  user_property_id: string;
  images: IntegrationPropertyImage[] | null;
  created_at: string;
  updated_at: string;
}
