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
  image: string | null;
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
  images: Prisma.JsonValue | null;
}): PropertyMapMarkerDto {
  const firstImage = Array.isArray(row.images)
    ? row.images.find(
        (image): image is string => typeof image === 'string' && image.length > 0,
      )
    : null;

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
    image: firstImage ?? null,
  };
}
