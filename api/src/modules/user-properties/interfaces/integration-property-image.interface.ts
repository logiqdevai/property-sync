export interface IntegrationPropertyImageBase {
  id: number;
  url?: string;
  source_image?: string;
}

export interface EstateWebIntegrationPropertyImage
  extends IntegrationPropertyImageBase {
  path: string;
  filename: string;
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
}

export type IntegrationPropertyImage = EstateWebIntegrationPropertyImage;
