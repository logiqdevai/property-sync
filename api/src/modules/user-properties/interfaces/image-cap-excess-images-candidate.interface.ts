export interface ImageCapExcessImageCandidate {
  id: number;
  source_image: string | null;
  // Live EstateWeb-hosted url for this image, always present. Used by the
  // UI as a thumbnail fallback when source_image is null -- i.e. this CRM
  // image couldn't be matched to one of our own local copies (uploaded
  // outside our pipeline, or a stale/never-populated cache entry) -- so the
  // admin can still see what they're about to delete instead of a blank box.
  url: string | null;
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
