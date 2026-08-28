export interface EstateWebDuplicatePropertyListing {
  id: number;
  address: string | null;
  price: number | null;
  created_at: string | null;
  user_property_id: string | null;
  property_id: string | null;
  canonical_property_id: string | null;
  internal_id: string | null;
}

export interface EstateWebDuplicatePropertyGroup {
  code: string;
  count: number;
  listings: EstateWebDuplicatePropertyListing[];
}
