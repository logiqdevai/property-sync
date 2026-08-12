export interface EstateWebDuplicatePropertyListing {
  id: number;
  address: string | null;
  price: number | null;
  created_at: string | null;
}

export interface EstateWebDuplicatePropertyGroup {
  code: string;
  count: number;
  listings: EstateWebDuplicatePropertyListing[];
}
