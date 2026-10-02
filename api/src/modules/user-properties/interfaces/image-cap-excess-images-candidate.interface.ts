export interface ImageCapExcessImageCandidate {
  id: number;
  source_image: string | null;
  filename: string | null;
}

export interface ImageCapExcessPropertyCandidate {
  user_property_id: string;
  user_id: string;
  property_id: string;
  title: string;
  agency_id: string;
  agency_name: string;
  user_integration_id: string;
  crm_property_id: string;
  local_image_count: number;
  crm_image_count: number;
  excess_count: number;
  // true when the first local_image_count CRM images (by position) all match
  // UserProperty.images, in order, and every CRM image after that position
  // matches nothing in UserProperty.images -- i.e. the excess is unambiguous.
  // false means the CRM's image order/content doesn't cleanly line up with
  // our local list (e.g. a manual reorder on the CRM side) and this property
  // needs individual review before anything is deleted.
  is_high_confidence: boolean;
  excess_images: ImageCapExcessImageCandidate[];
  kept_local_images: string[];
}
