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
