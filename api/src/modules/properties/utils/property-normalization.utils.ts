import { randomUUID } from 'crypto';
import {
  extractInternalIdFromText,
  readDetailStructured,
} from '@/integrations/crawler/utils/crawler.utils';
import {
  ListingType,
  Prisma,
  Property,
  PropertyHistoryEventType,
  PropertyStatus,
  PropertyType,
} from 'generated/prisma';
import {
  CmsPropertyFieldEntry,
  CmsPropertyMetadata,
} from '../interfaces/cms-property.interface';
import { sanitizeRawDescription } from '../constants/normalization-prompt';
import { mergeCmsFieldsFromNormalizedRow } from './property-cms-field-mapper.util';
import { resolveEstateWebLocationId } from '@/integrations/estateweb/utils/estateweb-location-lookup.util';

export interface NormalizedAiRow {
  index?: number;
  title?: string | null;
  listing_type?: string | null;
  property_type?: string | null;
  price?: number | null;
  price_start?: number | null;
  price_web?: number | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  square_meters?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: string | null;
  construction_year?: number | null;
  renovation_year?: number | null;
  energy_class?: string | null;
  road?: string | null;
  heating?: string | null;
  video_url?: string | null;
  distance_airport?: string | null;
  distance_port?: string | null;
  distance_beach?: string | null;
  estateweb_type_id?: number | null;
  estateweb_location_id?: number | null;
  cms_fields?: CmsPropertyFieldEntry[] | null;
  cms_metadata?: CmsPropertyMetadata | null;
  features?: string[] | null;
}

export interface PropertyRecordInput {
  title: string;
  description: string | null;
  property_id: string;
  internal_id: string | null;
  listing_type: ListingType;
  property_type: PropertyType;
  status: PropertyStatus;
  price: Prisma.Decimal | null;
  price_start: Prisma.Decimal | null;
  price_web: Prisma.Decimal | null;
  currency: string;
  city: string | null;
  district: string | null;
  address: string | null;
  postal_code: string | null;
  country: string;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  square_meters: Prisma.Decimal | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  construction_year: number | null;
  renovation_year: number | null;
  video_url: string | null;
  distance_airport: string | null;
  distance_port: string | null;
  distance_beach: string | null;
  estateweb_type_id: number | null;
  estateweb_location_id: number | null;
  cms_fields: Prisma.InputJsonValue | null;
  cms_metadata: Prisma.InputJsonValue | null;
  features: Prisma.InputJsonValue | null;
  images: Prisma.InputJsonValue | null;
  normalized_data: Prisma.InputJsonValue | null;
}

function readRawString(
  rawData: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = rawData[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }
  return null;
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

export function extractLatLng(rawData: unknown): {
  latitude: number | null;
  longitude: number | null;
} {
  if (!rawData || typeof rawData !== 'object') {
    return { latitude: null, longitude: null };
  }

  const data = rawData as Record<string, unknown>;
  const latLngRaw = data.lat_lng ?? data._lat_lng ?? data.latLng;
  if (typeof latLngRaw === 'string' && latLngRaw.includes(',')) {
    const [latRaw, lngRaw] = latLngRaw.split(',');
    const latitude = parseFloat(latRaw.trim());
    const longitude = parseFloat(lngRaw.trim());
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  const latitude =
    typeof data.latitude === 'number'
      ? data.latitude
      : parseFloat(String(data.latitude ?? ''));
  const longitude =
    typeof data.longitude === 'number'
      ? data.longitude
      : parseFloat(String(data.longitude ?? ''));

  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

export function parseFallbackPrice(
  rawPrice: string | null | undefined,
): number | null {
  const prices = parseAllPrices(rawPrice);
  if (prices.length === 0) return null;
  return prices.length >= 2
    ? Math.min(...prices)
    : prices[0];
}

export function parseAllPrices(
  rawPrice: string | null | undefined,
): number[] {
  if (!rawPrice) return [];
  const matches = [
    ...rawPrice.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g),
  ];
  const values: number[] = [];
  for (const match of matches) {
    const cleaned = match[0].replace(/\./g, '').replace(',', '.');
    const value = parseFloat(cleaned);
    if (Number.isFinite(value) && value > 0) values.push(value);
  }
  return [...new Set(values)];
}

function extractListedPriceFromDescription(
  description: string | null | undefined,
): number | null {
  if (!description) return null;
  const match = description.match(/Τιμή\s*:\s*([\d.,]+)/i);
  if (!match?.[1]) return null;
  return parseFallbackPrice(match[1]);
}

export function resolveNormalizedPrices(
  n: Pick<NormalizedAiRow, 'price' | 'price_start' | 'price_web'>,
  context?: {
    rawPrice?: string | null;
    rawDescription?: string | null;
  },
): {
  price: number | null;
  price_start: number | null;
  price_web: number | null;
} {
  let price = n.price ?? null;
  let priceStart = n.price_start ?? null;
  let priceWeb = n.price_web ?? null;

  const fromRaw = parseAllPrices(context?.rawPrice);
  const fromDesc = extractListedPriceFromDescription(context?.rawDescription);

  if (fromRaw.length >= 2) {
    const sorted = [...fromRaw].sort((a, b) => a - b);
    price = sorted[0];
    priceStart = sorted[sorted.length - 1];
  } else if (price != null && priceStart != null && priceStart < price) {
    const tmp = price;
    price = priceStart;
    priceStart = tmp;
  } else if (
    price != null &&
    fromDesc != null &&
    fromDesc < price &&
    (priceStart == null || priceStart === fromDesc)
  ) {
    priceStart = price;
    price = fromDesc;
  }

  if (priceWeb == null && price != null) {
    priceWeb = price;
  }

  return { price, price_start: priceStart, price_web: priceWeb };
}

function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  return value != null ? new Prisma.Decimal(value) : null;
}

function sanitizeCmsMetadata(
  metadata: CmsPropertyMetadata | null | undefined,
): Prisma.InputJsonValue | null {
  if (!metadata) return null;
  const entries = Object.entries(metadata).filter(
    ([, value]) => value != null && value !== '',
  );
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as Prisma.InputJsonValue;
}

export function buildFallbackNormalizedRow(sp: {
  raw_title: string | null;
  raw_price: string | null;
}): NormalizedAiRow {
  const prices = resolveNormalizedPrices(
    { price: parseFallbackPrice(sp.raw_price) },
    { rawPrice: sp.raw_price },
  );
  return {
    title: sp.raw_title,
    price: prices.price,
    price_start: prices.price_start,
    price_web: prices.price_web,
    listing_type: 'UNKNOWN',
    property_type: 'UNKNOWN',
  };
}

export function buildNormalizedRowFromExistingProperty(
  property: Property,
): NormalizedAiRow {
  return {
    title: property.title,
    listing_type: property.listing_type,
    property_type: property.property_type,
    price: property.price != null ? Number(property.price) : null,
    price_start:
      property.price_start != null ? Number(property.price_start) : null,
    price_web: property.price_web != null ? Number(property.price_web) : null,
    city: property.city,
    district: property.district,
    address: property.address,
    postal_code: property.postal_code,
    latitude: property.latitude != null ? Number(property.latitude) : null,
    longitude: property.longitude != null ? Number(property.longitude) : null,
    square_meters:
      property.square_meters != null ? Number(property.square_meters) : null,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    floor: property.floor,
    construction_year: property.construction_year,
    renovation_year: property.renovation_year,
    video_url: property.video_url,
    distance_airport: property.distance_airport,
    distance_port: property.distance_port,
    distance_beach: property.distance_beach,
    estateweb_type_id: property.estateweb_type_id,
    estateweb_location_id: property.estateweb_location_id,
    cms_fields: Array.isArray(property.cms_fields)
      ? (property.cms_fields as unknown as CmsPropertyFieldEntry[])
      : null,
    cms_metadata:
      property.cms_metadata as unknown as CmsPropertyMetadata | null,
    features: Array.isArray(property.features)
      ? (property.features as string[])
      : null,
  };
}

export function matchNormalizedRowsToIds(
  ids: string[],
  rows: NormalizedAiRow[],
): Map<string, NormalizedAiRow> {
  const result = new Map<string, NormalizedAiRow>();

  if (ids.length === 1 && rows.length >= 1) {
    result.set(ids[0], rows[0]);
    return result;
  }

  for (const row of rows) {
    if (row?.index == null) continue;
    const id = ids[row.index];
    if (id) result.set(id, row);
  }

  return result;
}

export function buildPropertyRecord(
  n: NormalizedAiRow,
  sp: {
    source_url: string;
    raw_title: string | null;
    raw_description: string | null;
    raw_price?: string | null;
    raw_data: unknown;
    property_id: string;
    internal_id: string | null;
  },
): PropertyRecordInput {
  const allImages = extractImages(sp.raw_data);
  const rawData =
    sp.raw_data && typeof sp.raw_data === 'object'
      ? (sp.raw_data as Record<string, unknown>)
      : null;
  const latLng = extractLatLng(sp.raw_data);
  const structured = readDetailStructured(sp.raw_data);
  const mergedCmsFields = mergeCmsFieldsFromNormalizedRow(
    n.cms_fields,
    n,
    structured,
  );
  const city = n.city ?? null;
  const district = n.district ?? null;
  const estatewebLocationId =
    n.estateweb_location_id ?? resolveEstateWebLocationId(city, district);
  const internalId =
    sp.internal_id ??
    extractInternalIdFromText(
      sp.raw_description,
      rawData
        ? readRawString(rawData, [
            '_detail_text',
            'detail_text',
            '_description',
            'description',
          ])
        : null,
    );
  const rawPrice =
    sp.raw_price ??
    (rawData != null
      ? readRawString(rawData, ['price', '_price'])
      : null);
  const detailText = rawData
    ? readRawString(rawData, ['_detail_text', 'detail_text'])
    : null;
  const prices = resolveNormalizedPrices(n, {
    rawPrice,
    rawDescription: sp.raw_description ?? detailText,
  });

  return {
    title: (sp.raw_title?.trim() || n.title?.trim() || sp.source_url),
    description: sanitizeRawDescription(sp.raw_description),
    property_id: sp.property_id,
    internal_id: internalId,
    listing_type: (n.listing_type as ListingType) ?? ListingType.UNKNOWN,
    property_type: (n.property_type as PropertyType) ?? PropertyType.UNKNOWN,
    status: PropertyStatus.ACTIVE,
    price: toDecimal(prices.price),
    price_start: toDecimal(prices.price_start),
    price_web: toDecimal(prices.price_web),
    currency: 'EUR',
    city,
    district,
    address: n.address ?? null,
    postal_code:
      n.postal_code ??
      (rawData
        ? readRawString(rawData, ['postal_code', 'zip', '_postal_code'])
        : null),
    country: 'GR',
    latitude: toDecimal(n.latitude ?? latLng.latitude),
    longitude: toDecimal(n.longitude ?? latLng.longitude),
    square_meters: toDecimal(n.square_meters),
    bedrooms: n.bedrooms ?? null,
    bathrooms: n.bathrooms ?? null,
    floor: n.floor ?? null,
    construction_year: n.construction_year ?? null,
    renovation_year: n.renovation_year ?? null,
    video_url:
      n.video_url ??
      (rawData ? readRawString(rawData, ['video_url', '_video_url']) : null),
    distance_airport:
      n.distance_airport ??
      (rawData
        ? readRawString(rawData, ['distance_airport', '_distance_airport'])
        : null),
    distance_port:
      n.distance_port ??
      (rawData
        ? readRawString(rawData, ['distance_port', '_distance_port'])
        : null),
    distance_beach:
      n.distance_beach ??
      (rawData
        ? readRawString(rawData, ['distance_beach', '_distance_beach'])
        : null),
    estateweb_type_id: n.estateweb_type_id ?? null,
    estateweb_location_id: estatewebLocationId,
    cms_fields:
      mergedCmsFields.length > 0
        ? (mergedCmsFields as unknown as Prisma.InputJsonValue)
        : null,
    cms_metadata: sanitizeCmsMetadata(n.cms_metadata),
    features: n.features ? (n.features as Prisma.InputJsonValue) : null,
    images: allImages.length > 0 ? (allImages as Prisma.InputJsonValue) : null,
    normalized_data: (sp.raw_data ?? null) as Prisma.InputJsonValue,
  };
}

export function detectDuplicates(
  properties: Array<{
    duplicate_group_id: string | null;
    title: string;
    city: string | null;
    price: Prisma.Decimal | null;
  }>,
): void {
  for (let i = 0; i < properties.length; i++) {
    for (let j = i + 1; j < properties.length; j++) {
      const a = properties[i];
      const b = properties[j];
      if (!a.title || !b.title) continue;

      const sameTitle =
        a.title.toLowerCase().trim() === b.title.toLowerCase().trim();
      const sameCity =
        a.city && b.city && a.city.toLowerCase() === b.city.toLowerCase();
      const priceA = a.price ? Number(a.price) : null;
      const priceB = b.price ? Number(b.price) : null;
      const priceClose =
        priceA != null &&
        priceB != null &&
        Math.abs(priceA - priceB) / Math.max(priceA, priceB) <= 0.01;

      if (sameTitle && sameCity && priceClose) {
        const groupId =
          a.duplicate_group_id ?? b.duplicate_group_id ?? randomUUID();
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

function decimalString(
  value: Prisma.Decimal | null | undefined,
): string | null {
  if (value == null) return null;
  return value.toString();
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
    'property_id',
    'internal_id',
    'listing_type',
    'property_type',
    'city',
    'district',
    'address',
    'postal_code',
    'square_meters',
    'bedrooms',
    'bathrooms',
    'floor',
    'construction_year',
    'renovation_year',
    'video_url',
    'distance_airport',
    'distance_port',
    'distance_beach',
    'price_start',
    'price_web',
    'estateweb_type_id',
    'estateweb_location_id',
    'cms_fields',
    'cms_metadata',
  ];

  let otherChanged = false;
  for (const field of trackedFields) {
    const oldVal = oldProperty[field as keyof Property];
    const newVal = newData[field];
    const oldSerialized =
      oldVal instanceof Prisma.Decimal ? oldVal.toString() : oldVal;
    const newSerialized =
      newVal instanceof Prisma.Decimal ? newVal.toString() : newVal;
    if (!valuesEqual(oldSerialized, newSerialized)) {
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
      candidate.title.toLowerCase().trim() ===
      record.title.toLowerCase().trim();
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
