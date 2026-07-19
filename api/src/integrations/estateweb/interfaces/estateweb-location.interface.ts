export interface EstateWebLocation {
  id: number;
  name: string;
  parent_id: number;
  level: number;
  is_city: boolean;
  path: string;
}

export interface EstateWebLocationCatalogItem {
  id: number;
  name: string;
  parent_id: number;
  level: number;
  is_city: boolean;
  path: string;
  has_children: boolean;
}

export interface EstateWebLocationMatchRequest {
  gateway_id: number;
  location_id: number;
}

export interface EstateWebLocationMatchResponseData {
  id: string;
  parent_id: string;
  name: string;
  level: string;
  path: string;
}

export interface EstateWebLocationMatchResponse {
  data: EstateWebLocationMatchResponseData;
}
