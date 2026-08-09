import { PropertyType } from 'generated/prisma';
import { getEstateWebInitPropertyType } from './estateweb-init-lookup.util';

const PROPERTY_TYPE_TO_ESTATEWEB_LEAF: Record<PropertyType, number | null> = {
  [PropertyType.LAND]: 2,
  [PropertyType.HOUSE]: 27,
  [PropertyType.VILLA]: 27,
  [PropertyType.MAISONETTE]: 26,
  [PropertyType.STUDIO]: 21,
  [PropertyType.APARTMENT]: 22,
  [PropertyType.COMMERCIAL]: 14,
  [PropertyType.OFFICE]: 13,
  [PropertyType.WAREHOUSE]: 11,
  [PropertyType.PARKING]: 902,
  [PropertyType.OTHER]: 901,
  [PropertyType.UNKNOWN]: null,
};

function apartmentLeafFromBedrooms(bedrooms: number | null | undefined): number {
  if (bedrooms == null || !Number.isFinite(bedrooms)) return 22;
  if (bedrooms <= 1) return 21;
  if (bedrooms === 2) return 22;
  if (bedrooms === 3) return 23;
  if (bedrooms === 4) return 24;
  return 25;
}

function asPropertyType(
  propertyType: string | PropertyType | null | undefined,
): PropertyType | null {
  if (!propertyType) return null;
  return (
    Object.values(PropertyType).find((value) => value === propertyType) ?? null
  );
}

export function resolveEstateWebTypeIdFromPropertyType(
  propertyType: string | PropertyType | null | undefined,
  bedrooms?: number | null,
): number | null {
  const resolved = asPropertyType(propertyType);
  if (!resolved || resolved === PropertyType.UNKNOWN) return null;

  const typeId =
    resolved === PropertyType.APARTMENT
      ? apartmentLeafFromBedrooms(bedrooms)
      : PROPERTY_TYPE_TO_ESTATEWEB_LEAF[resolved];

  if (typeId == null) return null;
  const type = getEstateWebInitPropertyType(typeId);
  if (!type || type.children.length > 0) return null;
  return typeId;
}
