import type { PropertyStatus } from "@/features/properties/interfaces/properties.interfaces";

export interface MapMarkerData {
  id: string;
  title: string;
  price: number | string | null;
  currency: string | null;
  city: string | null;
  status: PropertyStatus;
  latitude: number;
  longitude: number;
  agency_name: string | null;
  image: string | null;
}
