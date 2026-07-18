import { resolveEstateWebFieldOptionByName } from '@/integrations/estateweb/utils/estateweb-init-lookup.util';
import { CmsPropertyFieldEntry } from '../interfaces/cms-property.interface';
import { NormalizedAiRow } from './property-normalization.utils';

const ESTATEWEB_FIELD_CONSTRUCTION_YEAR = 1013;
const ESTATEWEB_FIELD_RENOVATION_YEAR = 1014;
const ESTATEWEB_FIELD_BEDROOMS = 2007;
const ESTATEWEB_FIELD_BATHROOMS = 2004;
const ESTATEWEB_FIELD_FLOOR = 4187;

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

export function mergeCmsFieldsFromNormalizedRow(
  aiFields: CmsPropertyFieldEntry[] | null | undefined,
  row: NormalizedAiRow,
): CmsPropertyFieldEntry[] {
  const fields = new Map<number, CmsPropertyFieldEntry>();

  for (const field of aiFields ?? []) {
    if (field?.id == null || field.value == null || field.value === '') continue;
    fields.set(field.id, { id: field.id, value: field.value });
  }

  if (row.construction_year != null) {
    upsertField(fields, ESTATEWEB_FIELD_CONSTRUCTION_YEAR, String(row.construction_year));
  }

  if (row.renovation_year != null) {
    upsertField(fields, ESTATEWEB_FIELD_RENOVATION_YEAR, String(row.renovation_year));
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

  return [...fields.values()];
}
