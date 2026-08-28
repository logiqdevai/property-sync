export type EstateWebIdentifierType = "code" | "id";

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
  user_property_id: string | null;
  property_id: string | null;
  canonical_property_id: string | null;
  internal_id: string | null;
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

export type EstateWebBulkJobEnqueueResult = {
  job_log_id: string;
  enqueued: number;
  failed: Array<{ code: string; error: string }>;
  message: string;
};

export type EstateWebBulkSitesByCodesItemResult = {
  code: string;
  property_id: number | null;
  status: "updated" | "failed";
  error?: string;
};

export type EstateWebBulkSitesByCodesJobResult = {
  total: number;
  processed: number;
  updated: number;
  failed: number;
  items: EstateWebBulkSitesByCodesItemResult[];
  logs?: string[];
};

export type EstateWebBulkDeleteByCodesItemResult = {
  code: string;
  property_id: number | null;
  status: "deleted" | "failed";
  error?: string;
};

export type EstateWebBulkDeleteByCodesJobResult = {
  total: number;
  processed: number;
  deleted: number;
  failed: number;
  items: EstateWebBulkDeleteByCodesItemResult[];
  logs?: string[];
};
