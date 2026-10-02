export interface DuplicateWatermarkImageCandidate {
  id: number;
  source_image: string;
  filename: string | null;
  // The specific GCS image that replaced this exact raw image, resolved by
  // matching canonical/current image position, not by array-index coincidence.
  after_image: string;
}

export interface DuplicateWatermarkPropertyCandidate {
  user_property_id: string;
  user_id: string;
  property_id: string;
  title: string;
  agency_id: string;
  agency_name: string;
  user_integration_id: string;
  crm_property_id: string;
  genuine_duplicate_count: number;
  excess_left_alone_count: number;
  genuine_duplicates: DuplicateWatermarkImageCandidate[];
}
