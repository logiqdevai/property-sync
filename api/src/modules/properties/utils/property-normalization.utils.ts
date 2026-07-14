import { randomUUID } from 'crypto';
import {
  ListingType,
  Prisma,
  Property,
  PropertyHistoryEventType,
  PropertyStatus,
  PropertyType,
} from 'generated/prisma';

export interface NormalizedAiRow {
  index?: number;
  title?: string | null;
  description?: string | null;
  listing_type?: string | null;
  property_type?: string | null;
  price?: number | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  square_meters?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: string | null;
  construction_year?: number | null;
  features?: string[] | null;
}

export interface PropertyRecordInput {
  title: string;
  description: string | null;
  listing_type: ListingType;
  property_type: PropertyType;
  status: PropertyStatus;
  price: Prisma.Decimal | null;
  currency: string;
  city: string | null;
  district: string | null;
  address: string | null;
  postal_code: string | null;
  country: string;
  latitude: null;
  longitude: null;
  square_meters: Prisma.Decimal | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  construction_year: number | null;
  renovation_year: null;
  features: Prisma.InputJsonValue | null;
  images: Prisma.InputJsonValue | null;
  normalized_data: Prisma.InputJsonValue | null;
}

export function extractImages(rawData: unknown): string[] {
  if (!rawData || typeof rawData !== 'object') return [];
  const data = rawData as Record<string, unknown>;
  const fromUnderscore = data._all_images;
  const fromPlain = data.all_images;
  const images = fromUnderscore ?? fromPlain;
  if (!Array.isArray(images)) return [];
  return images.filter((item): item is string => typeof item === 'string');
}

export function parseFallbackPrice(rawPrice: string | null | undefined): number | null {
  if (!rawPrice) return null;
  const cleaned = rawPrice.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function buildFallbackNormalizedRow(sp: {
  raw_title: string | null;
  raw_price: string | null;
}): NormalizedAiRow {
  return {
    title: sp.raw_title,
    price: parseFallbackPrice(sp.raw_price),
    listing_type: 'UNKNOWN',
    property_type: 'UNKNOWN',
  };
}

export function buildPropertyRecord(
  n: NormalizedAiRow,
  sp: {
    source_url: string;
    raw_title: string | null;
    raw_description: string | null;
    raw_data: unknown;
  },
): PropertyRecordInput {
  const allImages = extractImages(sp.raw_data);

  return {
    title: n.title ?? sp.raw_title ?? sp.source_url,
    description: n.description ?? null,
    listing_type: (n.listing_type as ListingType) ?? ListingType.UNKNOWN,
    property_type: (n.property_type as PropertyType) ?? PropertyType.UNKNOWN,
    status: PropertyStatus.ACTIVE,
    price: n.price != null ? new Prisma.Decimal(n.price) : null,
    currency: 'EUR',
    city: n.city ?? null,
    district: n.district ?? null,
    address: n.address ?? null,
    postal_code: null,
    country: 'GR',
    latitude: null,
    longitude: null,
    square_meters:
      n.square_meters != null ? new Prisma.Decimal(n.square_meters) : null,
    bedrooms: n.bedrooms ?? null,
    bathrooms: n.bathrooms ?? null,
    floor: n.floor ?? null,
    construction_year: n.construction_year ?? null,
    renovation_year: null,
    features: n.features ? (n.features as Prisma.InputJsonValue) : null,
    images: allImages.length > 0 ? (allImages as Prisma.InputJsonValue) : null,
    normalized_data: (sp.raw_data ?? null) as Prisma.InputJsonValue,
  };
}

export function detectDuplicates(
  properties: Array<{ duplicate_group_id: string | null; title: string; city: string | null; price: Prisma.Decimal | null }>,
): void {
  for (let i = 0; i < properties.length; i++) {
    for (let j = i + 1; j < properties.length; j++) {
      const a = properties[i];
      const b = properties[j];
      if (!a.title || !b.title) continue;

      const sameTitle =
        a.title.toLowerCase().trim() === b.title.toLowerCase().trim();
      const sameCity =
        a.city &&
        b.city &&
        a.city.toLowerCase() === b.city.toLowerCase();
      const priceA = a.price ? Number(a.price) : null;
      const priceB = b.price ? Number(b.price) : null;
      const priceClose =
        priceA != null &&
        priceB != null &&
        Math.abs(priceA - priceB) / Math.max(priceA, priceB) <= 0.01;

      if (sameTitle && sameCity && priceClose) {
        const groupId = a.duplicate_group_id ?? b.duplicate_group_id ?? randomUUID();
        a.duplicate_group_id = groupId;
        b.duplicate_group_id = groupId;
      }
    }
  }
}

export interface HistoryWriteInput {
  property_id: string;
  event_type: PropertyHistoryEventType;
  field?: string | null;
  old_value?: Prisma.InputJsonValue | null;
  new_value?: Prisma.InputJsonValue | null;
  crawl_run_id?: string | null;
}

function imagesArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function decimalString(value: Prisma.Decimal | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

export function diffPropertyChanges(
  oldProperty: Property,
  newData: PropertyRecordInput,
  crawlRunId: string,
): HistoryWriteInput[] {
  const events: HistoryWriteInput[] = [];
  const base = { property_id: oldProperty.id, crawl_run_id: crawlRunId };

  const oldPrice = decimalString(oldProperty.price);
  const newPrice = decimalString(newData.price);
  if (oldPrice !== newPrice) {
    events.push({
      ...base,
      event_type: PropertyHistoryEventType.PRICE_CHANGED,
      field: 'price',
      old_value: oldPrice,
      new_value: newPrice,
    });
  }

  const oldImages = imagesArray(oldProperty.images);
  const newImages = imagesArray(newData.images);
  const addedImages = newImages.filter((img) => !oldImages.includes(img));
  const removedImages = oldImages.filter((img) => !newImages.includes(img));

  if (addedImages.length > 0) {
    events.push({
      ...base,
      event_type: PropertyHistoryEventType.IMAGE_ADDED,
      field: 'images',
      old_value: oldImages,
      new_value: newImages,
    });
  }

  if (removedImages.length > 0 && addedImages.length === 0) {
    events.push({
      ...base,
      event_type: PropertyHistoryEventType.IMAGE_REMOVED,
      field: 'images',
      old_value: oldImages,
      new_value: newImages,
    });
  }

  if (oldProperty.status !== newData.status) {
    events.push({
      ...base,
      event_type: PropertyHistoryEventType.STATUS_CHANGED,
      field: 'status',
      old_value: oldProperty.status,
      new_value: newData.status,
    });
  }

  const trackedFields: Array<keyof PropertyRecordInput> = [
    'title',
    'description',
    'listing_type',
    'property_type',
    'city',
    'district',
    'address',
    'square_meters',
    'bedrooms',
    'bathrooms',
    'floor',
    'construction_year',
  ];

  let otherChanged = false;
  for (const field of trackedFields) {
    const oldVal = oldProperty[field as keyof Property];
    const newVal = newData[field];
    const oldSerialized =
      oldVal instanceof Prisma.Decimal ? oldVal.toString() : oldVal;
    const newSerialized =
      newVal instanceof Prisma.Decimal ? newVal.toString() : newVal;
    if (JSON.stringify(oldSerialized) !== JSON.stringify(newSerialized)) {
      otherChanged = true;
      break;
    }
  }

  if (otherChanged && events.length === 0) {
    events.push({
      ...base,
      event_type: PropertyHistoryEventType.UPDATED,
      field: null,
      old_value: null,
      new_value: null,
    });
  }

  return events;
}

export function matchExistingDuplicateGroup(
  record: PropertyRecordInput,
  existing: Array<{
    id: string;
    title: string;
    city: string | null;
    price: Prisma.Decimal | null;
    duplicate_group_id: string | null;
  }>,
): string | null {
  for (const candidate of existing) {
    if (!candidate.title || !record.title) continue;
    const sameTitle =
      candidate.title.toLowerCase().trim() === record.title.toLowerCase().trim();
    const sameCity =
      candidate.city &&
      record.city &&
      candidate.city.toLowerCase() === record.city.toLowerCase();
    const priceA = candidate.price ? Number(candidate.price) : null;
    const priceB = record.price ? Number(record.price) : null;
    const priceClose =
      priceA != null &&
      priceB != null &&
      Math.abs(priceA - priceB) / Math.max(priceA, priceB) <= 0.01;

    if (sameTitle && sameCity && priceClose && candidate.duplicate_group_id) {
      return candidate.duplicate_group_id;
    }
  }

  return null;
}
