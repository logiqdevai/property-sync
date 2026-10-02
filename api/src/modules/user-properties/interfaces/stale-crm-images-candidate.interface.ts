export interface StaleCrmImageCandidate {
  position: number;
  crm_image_id: number;
  new_source_image: string;
  old_source_image: string | null;
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
}

export interface StaleCrmImagePropertyCandidate {
  user_property_id: string;
  user_id: string;
  property_id: string;
  title: string;
  agency_id: string;
  agency_name: string;
  user_integration_id: string;
  crm_property_id: string;
  mismatches: StaleCrmImageCandidate[];
}
