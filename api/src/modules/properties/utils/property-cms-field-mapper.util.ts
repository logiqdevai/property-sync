import { EstateWebFieldType } from '@/integrations/estateweb/constants/estateweb-enums.constants';
import {
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

function upsertField(
  fields: Map<number, CmsPropertyFieldEntry>,
  id: number,
  value: string | number | null | undefined,
): void {
  if (value == null || value === '') return;
  if (fields.has(id)) return;
  fields.set(id, { id, value });
}

function resolveFloorValue(floor: string): number | string | null {
  const trimmed = floor.trim();
  if (!trimmed) return null;

  const numericOnly = trimmed.match(/^(\d+)(?:ος|η|ο)?(?:\s*όροφος)?$/i);
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

  return trimmed;
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

function splitValueTokens(value: string): string[] {
  return value
    .split(/[,/·]|\s[-–—]\s/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function applyBooleanFieldByName(
  fields: Map<number, CmsPropertyFieldEntry>,
  name: string,
): void {
  const field = resolveEstateWebFieldByName(name);
  if (field && field.type_id === EstateWebFieldType.BOOLEAN) {
    upsertField(fields, field.id, '1');
  }
}

function applyStructuredSpec(
  fields: Map<number, CmsPropertyFieldEntry>,
  label: string,
  value: string,
): void {
  const field = resolveEstateWebFieldByName(label);
  if (field) {
    switch (field.type_id) {
      case EstateWebFieldType.SELECT: {
        const option = resolveEstateWebFieldOptionByName(field.id, value);
        if (option) upsertField(fields, field.id, option.id);
        break;
      }
      case EstateWebFieldType.BOOLEAN: {
        if (isTruthyValue(value)) upsertField(fields, field.id, '1');
        break;
      }
      case EstateWebFieldType.NUMERIC: {
        const num = parseFirstInteger(value);
        if (num != null) upsertField(fields, field.id, String(num));
        break;
      }
      case EstateWebFieldType.TEXT: {
        upsertField(fields, field.id, value);
        break;
      }
      default:
        break;
    }
  }

  for (const token of splitValueTokens(value)) {
    applyBooleanFieldByName(fields, token);
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

  for (const field of aiFields ?? []) {
    if (field?.id == null || field.value == null || field.value === '')
      continue;
    fields.set(field.id, { id: field.id, value: field.value });
  }

  if (row.construction_year != null) {
    upsertField(
      fields,
      ESTATEWEB_FIELD_CONSTRUCTION_YEAR,
      String(row.construction_year),
    );
  }

  if (row.renovation_year != null) {
    upsertField(
      fields,
      ESTATEWEB_FIELD_RENOVATION_YEAR,
      String(row.renovation_year),
    );
  }

  if (row.bedrooms != null) {
    upsertField(fields, ESTATEWEB_FIELD_BEDROOMS, String(row.bedrooms));
  }

  if (row.bathrooms != null) {
    upsertField(fields, ESTATEWEB_FIELD_BATHROOMS, String(row.bathrooms));
  }

  if (row.floor) {
    const floorValue = resolveFloorValue(row.floor);
    if (floorValue != null) {
      upsertField(fields, ESTATEWEB_FIELD_FLOOR, floorValue);
    }
  }

  if (row.energy_class) {
    const option = resolveEstateWebFieldOptionByName(
      ESTATEWEB_FIELD_ENERGY_CLASS,
      row.energy_class,
    );
    if (option) upsertField(fields, ESTATEWEB_FIELD_ENERGY_CLASS, option.id);
  }

  if (row.heating) {
    for (const token of splitValueTokens(row.heating)) {
      applyBooleanFieldByName(fields, token);
    }
  }

  for (const [label, value] of Object.entries(structured?.specs ?? {})) {
    applyStructuredSpec(fields, label, value);
  }

  for (const feature of structured?.features ?? []) {
    const match = feature.match(/^(.{1,50}?)\s*[:：]\s*(.+)$/);
    if (match) {
      applyStructuredSpec(fields, match[1], match[2]);
    } else {
      applyBooleanFieldByName(fields, feature);
    }
  }

  return [...fields.values()];
}
