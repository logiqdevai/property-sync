import { EstateWebFieldType } from '@/integrations/estateweb/constants/estateweb-enums.constants';
import {
  getEstateWebInitField,
  getEstateWebInitFieldOption,
  normalizeEstateWebLabel,
  resolveEstateWebFieldByName,
  resolveEstateWebFieldOptionByName,
} from '@/integrations/estateweb/utils/estateweb-init-lookup.util';
import { CmsPropertyFieldEntry } from '../interfaces/cms-property.interface';
import { NormalizedAiRow } from './property-normalization.utils';

const ESTATEWEB_FIELD_CONSTRUCTION_YEAR = 1013;
const ESTATEWEB_FIELD_RENOVATION_YEAR = 1014;
const ESTATEWEB_FIELD_BEDROOMS = 2007;
const ESTATEWEB_FIELD_BATHROOMS = 2004;
const ESTATEWEB_FIELD_FLOOR = 4187;
const ESTATEWEB_FIELD_ENERGY_CLASS = 2010;

const NEGATIVE_VALUE_TOKENS = new Set([
  'όχι',
  'οχι',
  'no',
  'false',
  '0',
  '-',
  'δεν',
  'καμία',
  'καμια',
  'κανένα',
  'κανενα',
]);

function isFieldAllowedForType(
  fieldId: number,
  propertyTypeId?: number | null,
): boolean {
  if (propertyTypeId == null) return true;
  const field = getEstateWebInitField(fieldId);
  if (!field) return false;
  return field.types.length === 0 || field.types.includes(propertyTypeId);
}

function upsertField(
  fields: Map<number, CmsPropertyFieldEntry>,
  id: number,
  value: string | number | null | undefined,
  propertyTypeId?: number | null,
): void {
  if (value == null || value === '') return;
  if (!isFieldAllowedForType(id, propertyTypeId)) return;
  if (fields.has(id)) return;
  fields.set(id, { id, value });
}

function resolveFloorValue(floor: string): number | null {
  const trimmed = floor.trim();
  if (!trimmed) return null;

  const normalized = normalizeEstateWebLabel(trimmed);
  const numericOnly = normalized.match(
    /^(\d+)\s*(?:ος|ης|ο|η)?(?:\s*οροφος)?$/,
  );
  if (numericOnly) {
    const resolved = resolveEstateWebFieldOptionByName(
      ESTATEWEB_FIELD_FLOOR,
      numericOnly[1],
    );
    if (resolved) return resolved.id;
  }

  const resolved = resolveEstateWebFieldOptionByName(
    ESTATEWEB_FIELD_FLOOR,
    trimmed,
  );
  if (resolved) return resolved.id;

  return null;
}

function isTruthyValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !NEGATIVE_VALUE_TOKENS.has(normalized);
}

function parseFirstInteger(value: string): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function coerceSelectFieldValue(
  fieldId: number,
  value: string | number,
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return getEstateWebInitFieldOption(fieldId, value) ? value : null;
  }

  const asString = String(value).trim();
  if (!asString) return null;

  if (/^-?\d+$/.test(asString)) {
    const asNumber = Number(asString);
    if (getEstateWebInitFieldOption(fieldId, asNumber)) return asNumber;
  }

  if (fieldId === ESTATEWEB_FIELD_FLOOR) {
    return resolveFloorValue(asString);
  }

  const byName = resolveEstateWebFieldOptionByName(fieldId, asString);
  return byName?.id ?? null;
}

/**
 * Coerce a stored cms_fields entry into the EstateWeb payload shape.
 * Drops entries that cannot be safely mapped (e.g. free-text on SELECT).
 */
export function coerceCmsFieldValueForEstateWeb(
  fieldId: number,
  value: string | number,
): string | number | null {
  const field = getEstateWebInitField(fieldId);
  if (!field) return null;

  switch (field.type_id) {
    case EstateWebFieldType.SELECT:
      return coerceSelectFieldValue(fieldId, value);
    case EstateWebFieldType.BOOLEAN: {
      if (value === '1' || value === 1) return '1';
      if (typeof value === 'string' && isTruthyValue(value)) return '1';
      return null;
    }
    case EstateWebFieldType.NUMERIC: {
      if (typeof value === 'number' && Number.isInteger(value)) {
        return String(value);
      }
      if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
        return value.trim();
      }
      if (typeof value === 'string') {
        const num = parseFirstInteger(value);
        return num != null ? String(num) : null;
      }
      return null;
    }
    case EstateWebFieldType.TEXT: {
      const text = String(value).trim();
      return text || null;
    }
    default:
      return null;
  }
}

function splitValueTokens(value: string): string[] {
  return value
    .split(/[,/·]|\s[-–—]\s/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function applyBooleanFieldByName(
  fields: Map<number, CmsPropertyFieldEntry>,
  name: string,
  propertyTypeId?: number | null,
): void {
  const field = resolveEstateWebFieldByName(name, {
    property_type_id: propertyTypeId ?? undefined,
  });
  if (field && field.type_id === EstateWebFieldType.BOOLEAN) {
    upsertField(fields, field.id, '1', propertyTypeId);
  }
}

function applyStructuredSpec(
  fields: Map<number, CmsPropertyFieldEntry>,
  label: string,
  value: string,
  propertyTypeId?: number | null,
): void {
  const field = resolveEstateWebFieldByName(label, {
    property_type_id: propertyTypeId ?? undefined,
  });
  if (field) {
    switch (field.type_id) {
      case EstateWebFieldType.SELECT: {
        const coerced = coerceCmsFieldValueForEstateWeb(field.id, value);
        if (coerced != null) upsertField(fields, field.id, coerced, propertyTypeId);
        break;
      }
      case EstateWebFieldType.BOOLEAN: {
        if (isTruthyValue(value)) upsertField(fields, field.id, '1', propertyTypeId);
        break;
      }
      case EstateWebFieldType.NUMERIC: {
        const num = parseFirstInteger(value);
        if (num != null) upsertField(fields, field.id, String(num), propertyTypeId);
        break;
      }
      case EstateWebFieldType.TEXT: {
        upsertField(fields, field.id, value, propertyTypeId);
        break;
      }
      default:
        break;
    }
  }

  for (const token of splitValueTokens(value)) {
    applyBooleanFieldByName(fields, token, propertyTypeId);
  }
}

export function mergeCmsFieldsFromNormalizedRow(
  aiFields: CmsPropertyFieldEntry[] | null | undefined,
  row: NormalizedAiRow,
  structured?: {
    specs: Record<string, string> | null;
    features: string[] | null;
  },
): CmsPropertyFieldEntry[] {
  const fields = new Map<number, CmsPropertyFieldEntry>();
  const propertyTypeId = row.estateweb_type_id ?? null;

  if (row.construction_year != null) {
    upsertField(
      fields,
      ESTATEWEB_FIELD_CONSTRUCTION_YEAR,
      String(row.construction_year),
      propertyTypeId,
    );
  }

  if (row.renovation_year != null) {
    upsertField(
      fields,
      ESTATEWEB_FIELD_RENOVATION_YEAR,
      String(row.renovation_year),
      propertyTypeId,
    );
  }

  if (row.bedrooms != null) {
    upsertField(
      fields,
      ESTATEWEB_FIELD_BEDROOMS,
      String(row.bedrooms),
      propertyTypeId,
    );
  }

  if (row.bathrooms != null) {
    upsertField(
      fields,
      ESTATEWEB_FIELD_BATHROOMS,
      String(row.bathrooms),
      propertyTypeId,
    );
  }

  if (row.floor) {
    const floorValue = resolveFloorValue(row.floor);
    if (floorValue != null) {
      upsertField(fields, ESTATEWEB_FIELD_FLOOR, floorValue, propertyTypeId);
    }
  }

  if (row.energy_class) {
    const option = resolveEstateWebFieldOptionByName(
      ESTATEWEB_FIELD_ENERGY_CLASS,
      row.energy_class,
    );
    if (option) {
      upsertField(
        fields,
        ESTATEWEB_FIELD_ENERGY_CLASS,
        option.id,
        propertyTypeId,
      );
    }
  }

  if (row.heating) {
    for (const token of splitValueTokens(row.heating)) {
      applyBooleanFieldByName(fields, token, propertyTypeId);
    }
  }

  for (const [label, value] of Object.entries(structured?.specs ?? {})) {
    applyStructuredSpec(fields, label, value, propertyTypeId);
  }

  for (const feature of structured?.features ?? []) {
    const match = feature.match(/^(.{1,50}?)\s*[:：]\s*(.+)$/);
    if (match) {
      applyStructuredSpec(fields, match[1], match[2], propertyTypeId);
    } else {
      applyBooleanFieldByName(fields, feature, propertyTypeId);
    }
  }

  for (const field of aiFields ?? []) {
    if (field?.id == null || field.value == null || field.value === '')
      continue;
    const coerced = coerceCmsFieldValueForEstateWeb(field.id, field.value);
    if (coerced != null) {
      upsertField(fields, field.id, coerced, propertyTypeId);
    }
  }

  return [...fields.values()];
}
