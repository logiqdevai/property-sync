import { Prisma } from 'generated/prisma';

export const PROPERTY_MAP_MARKERS_HARD_CAP = 2000;

export interface PropertyMapMarkerDto {
  id: string;
  title: string;
  price: number | null;
  currency: string | null;
  city: string | null;
  status: string;
  latitude: number;
  longitude: number;
  agency_name: string | null;
}

export function toPropertyMapMarker(row: {
  id: string;
  title: string;
  price: Prisma.Decimal | null;
  currency: string | null;
  city: string | null;
  status: string;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  agency_name: string | null;
}): PropertyMapMarkerDto {
  return {
    id: row.id,
    title: row.title,
    price: row.price != null ? Number(row.price) : null,
    currency: row.currency,
    city: row.city,
    status: row.status,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    agency_name: row.agency_name,
  };
}
