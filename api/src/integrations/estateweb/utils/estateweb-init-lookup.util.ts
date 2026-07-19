import { EstateWebFieldType } from '../constants/estateweb-enums.constants';
import {
  ESTATEWEB_INIT_FIELDS,
  ESTATEWEB_INIT_PROPERTY_TYPES,
  EstateWebInitField,
  EstateWebInitFieldOption,
  EstateWebInitPropertyType,
} from '../constants/estateweb-init.constants';

/**
 * Normalize a string for diacritic-insensitive Greek/Latin comparison.
 * Applies NFD, strips combining marks, and lowercases.
 */
export function normalizeEstateWebLabel(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function flattenPropertyTypes(
  types: EstateWebInitPropertyType[],
): EstateWebInitPropertyType[] {
  const out: EstateWebInitPropertyType[] = [];
  for (const t of types) {
    out.push(t);
    if (t.children.length > 0) {
      out.push(...flattenPropertyTypes(t.children));
    }
  }
  return out;
}

const FLAT_PROPERTY_TYPES = flattenPropertyTypes(ESTATEWEB_INIT_PROPERTY_TYPES);
const PROPERTY_TYPE_BY_ID = new Map<number, EstateWebInitPropertyType>(
  FLAT_PROPERTY_TYPES.map((t) => [t.id, t]),
);
const PROPERTY_TYPE_BY_NORMALIZED_NAME = new Map<
  string,
  EstateWebInitPropertyType
>(FLAT_PROPERTY_TYPES.map((t) => [normalizeEstateWebLabel(t.name), t]));

const FIELD_BY_ID = new Map<number, EstateWebInitField>(
  ESTATEWEB_INIT_FIELDS.map((f) => [f.id, f]),
);

const FIELD_OPTION_INDEX: Map<
  number,
  Map<string, EstateWebInitFieldOption>
> = (() => {
  const idx = new Map<number, Map<string, EstateWebInitFieldOption>>();
  for (const field of ESTATEWEB_INIT_FIELDS) {
    if (field.field_options.length === 0) continue;
    const inner = new Map<string, EstateWebInitFieldOption>();
    for (const opt of field.field_options) {
      inner.set(normalizeEstateWebLabel(opt.name), opt);
    }
    idx.set(field.id, inner);
  }
  return idx;
})();

const FIELD_OPTION_BY_ID: Map<
  number,
  Map<number, EstateWebInitFieldOption>
> = (() => {
  const idx = new Map<number, Map<number, EstateWebInitFieldOption>>();
  for (const field of ESTATEWEB_INIT_FIELDS) {
    if (field.field_options.length === 0) continue;
    const inner = new Map<number, EstateWebInitFieldOption>();
    for (const opt of field.field_options) {
      inner.set(opt.id, opt);
    }
    idx.set(field.id, inner);
  }
  return idx;
})();

/** Resolve a property type by numeric id. Walks the entire tree. */
export function getEstateWebInitPropertyType(
  typeId: number,
): EstateWebInitPropertyType | undefined {
  return PROPERTY_TYPE_BY_ID.get(typeId);
}

/** Resolve a property type by name (exact then diacritic-insensitive). */
export function resolveEstateWebPropertyTypeByName(
  name: string,
): EstateWebInitPropertyType | undefined {
  if (!name) return undefined;
  const exact = FLAT_PROPERTY_TYPES.find((t) => t.name === name);
  if (exact) return exact;
  return PROPERTY_TYPE_BY_NORMALIZED_NAME.get(normalizeEstateWebLabel(name));
}

/**
 * Breadcrumb path for a property type id, e.g. `"Κατοικία > Γκαρσονιέρα"`.
 * Returns `undefined` when the id is unknown.
 */
export function getEstateWebPropertyTypeNamePath(
  typeId: number,
): string | undefined {
  const parts: string[] = [];
  let current = PROPERTY_TYPE_BY_ID.get(typeId);
  if (!current) return undefined;
  while (current) {
    parts.unshift(current.name);
    if (current.parent_id === null) break;
    current = PROPERTY_TYPE_BY_ID.get(current.parent_id);
  }
  return parts.join(' > ');
}

/** Resolve a field definition by numeric id. */
export function getEstateWebInitField(
  fieldId: number,
): EstateWebInitField | undefined {
  return FIELD_BY_ID.get(fieldId);
}

/**
 * Resolve a field by name, optionally restricting the search to fields that
 * belong to a given property type and/or have a specific data-type
 * (`EstateWebFieldType`). Falls back to diacritic-insensitive matching.
 */
export function resolveEstateWebFieldByName(
  name: string,
  opts: {
    property_type_id?: number;
    field_type?: EstateWebFieldType;
  } = {},
): EstateWebInitField | undefined {
  if (!name) return undefined;
  const normalized = normalizeEstateWebLabel(name);
  const candidates = ESTATEWEB_INIT_FIELDS.filter((field) => {
    if (
      opts.property_type_id !== undefined &&
      field.types.length > 0 &&
      !field.types.includes(opts.property_type_id)
    ) {
      return false;
    }
    if (opts.field_type !== undefined && field.type_id !== opts.field_type) {
      return false;
    }
    return true;
  });
  const exact = candidates.find((f) => f.name === name);
  if (exact) return exact;
  return candidates.find((f) => normalizeEstateWebLabel(f.name) === normalized);
}

/**
 * Return every init field applicable to a property `type_id`. Universal
 * fields (empty `types` array) are always included.
 */
export function getEstateWebInitFieldsForType(
  typeId: number,
): EstateWebInitField[] {
  return ESTATEWEB_INIT_FIELDS.filter(
    (field) => field.types.length === 0 || field.types.includes(typeId),
  );
}

/** Resolve a specific field option by its numeric id. */
export function getEstateWebInitFieldOption(
  fieldId: number,
  optionId: number,
): EstateWebInitFieldOption | undefined {
  return FIELD_OPTION_BY_ID.get(fieldId)?.get(optionId);
}

/** Human name of a field option id, or `undefined` when unknown. */
export function getEstateWebFieldOptionName(
  fieldId: number,
  optionId: number,
): string | undefined {
  return FIELD_OPTION_BY_ID.get(fieldId)?.get(optionId)?.name;
}

/**
 * Resolve a field option by label (exact then diacritic-insensitive).
 */
export function resolveEstateWebFieldOptionByName(
  fieldId: number,
  name: string,
): EstateWebInitFieldOption | undefined {
  if (!name) return undefined;
  const inner = FIELD_OPTION_INDEX.get(fieldId);
  if (!inner) return undefined;
  const field = FIELD_BY_ID.get(fieldId);
  if (field) {
    const exact = field.field_options.find((opt) => opt.name === name);
    if (exact) return exact;
  }
  return inner.get(normalizeEstateWebLabel(name));
}
