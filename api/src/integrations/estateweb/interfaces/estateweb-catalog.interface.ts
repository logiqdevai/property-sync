export interface EstateWebFlatCatalogItem {
  id: number;
  name: string;
}

export interface EstateWebPropertyTypeCatalogItem {
  id: number;
  name: string;
  parent_id: number | null;
  path: string;
  has_children: boolean;
  is_leaf: boolean;
}
