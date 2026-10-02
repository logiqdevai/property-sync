export interface DuplicateWatermarkImageCandidate {
  id: number;
  source_image: string;
  filename: string | null;
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
  kept_gcs_count: number;
  genuine_duplicate_count: number;
  excess_left_alone_count: number;
  // true when genuine_duplicate_count === kept_gcs_count -- no ambiguity about
  // how many stale originals should exist. false means the counts disagree
  // (likely a mix of a real duplicate and photos that fell outside the image
  // cap) and this property needs individual review before anything is deleted.
  is_high_confidence: boolean;
  genuine_duplicates: DuplicateWatermarkImageCandidate[];
  kept_gcs_images: string[];
}
