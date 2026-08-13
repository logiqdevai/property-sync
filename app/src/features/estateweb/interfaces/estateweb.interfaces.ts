export type EstateWebLocationCatalogItem = {
  id: number;
  name: string;
  parent_id: number;
  level: number;
  is_city: boolean;
  path: string;
  has_children: boolean;
};

export type EstateWebFlatCatalogItem = {
  id: number;
  name: string;
};

export type EstateWebPropertyTypeCatalogItem = {
  id: number;
  name: string;
  parent_id: number | null;
  path: string;
  has_children: boolean;
  is_leaf: boolean;
};

export type EstateWebDuplicatePropertyListing = {
  id: number;
  address: string | null;
  price: number | null;
  created_at: string | null;
};

export type EstateWebDuplicatePropertyGroup = {
  code: string;
  count: number;
  listings: EstateWebDuplicatePropertyListing[];
};

export type EstateWebAdminIntegration = {
  id: string;
  userId: string;
  userEmail: string;
  email: string | null;
  isActive: boolean;
  isDefault: boolean;
  baseUrl: string;
};

export type EstateWebBulkSitesUpdateResult = {
  code: string;
  propertyId: number | null;
  success: boolean;
  error?: string;
};
