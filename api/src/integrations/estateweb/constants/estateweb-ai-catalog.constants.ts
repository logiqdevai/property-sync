import { EstateWebFieldType } from './estateweb-enums.constants';
import {
  ESTATEWEB_INIT_FIELDS,
  ESTATEWEB_INIT_PROPERTY_TYPES,
  EstateWebInitField,
  EstateWebInitPropertyType,
} from './estateweb-init.constants';

/**
 * Compact form of an `EstateWebInitField` intended for LLM prompts.
 * Drops raw `type_id` and `types` in favor of a human-readable `kind`.
 */
export interface EstateWebAiFieldOption {
  id: number;
  name: string;
}

export interface EstateWebAiFieldEntry {
  id: number;
  name: string;
  kind: 'number' | 'select' | 'boolean' | 'text';
  /** Only present when `kind === 'select'`. */
  options?: EstateWebAiFieldOption[];
}

export interface EstateWebAiPropertyTypeEntry {
  id: number;
  name: string;
  /** Breadcrumb like `"Κατοικία > Γκαρσονιέρα"`. */
  path: string;
  parent_id: number | null;
  /** `true` when this node has no children — it is a valid `type_id` payload. */
  is_leaf: boolean;
}

const FIELD_TYPE_TO_KIND: Record<
  EstateWebFieldType,
  EstateWebAiFieldEntry['kind']
> = {
  [EstateWebFieldType.NUMERIC]: 'number',
  [EstateWebFieldType.SELECT]: 'select',
  [EstateWebFieldType.BOOLEAN]: 'boolean',
  [EstateWebFieldType.TEXT]: 'text',
};

function toAiFieldEntry(field: EstateWebInitField): EstateWebAiFieldEntry {
  const kind =
    FIELD_TYPE_TO_KIND[field.type_id as EstateWebFieldType] ?? 'text';
  const entry: EstateWebAiFieldEntry = {
    id: field.id,
    name: field.name,
    kind,
  };
  if (kind === 'select' && field.field_options.length > 0) {
    entry.options = field.field_options.map((opt) => ({
      id: opt.id,
      name: opt.name,
    }));
  }
  return entry;
}

/**
 * Return the fields applicable to a given property `type_id`, plus universal
 * fields (fields with empty `types` array — they apply to any property type).
 * When `propertyTypeId` is omitted, every field in `/api/init` is returned.
 */
export function buildEstateWebAiFieldCatalog(
  propertyTypeId?: number,
): EstateWebAiFieldEntry[] {
  const filtered =
    propertyTypeId === undefined
      ? ESTATEWEB_INIT_FIELDS
      : ESTATEWEB_INIT_FIELDS.filter(
          (field) =>
            field.types.length === 0 || field.types.includes(propertyTypeId),
        );
  return filtered.map(toAiFieldEntry);
}

function flattenPropertyTypesWithPath(
  nodes: EstateWebInitPropertyType[],
  prefix: string,
): EstateWebAiPropertyTypeEntry[] {
  const out: EstateWebAiPropertyTypeEntry[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix} > ${node.name}` : node.name;
    out.push({
      id: node.id,
      name: node.name,
      path,
      parent_id: node.parent_id,
      is_leaf: node.children.length === 0,
    });
    if (node.children.length > 0) {
      out.push(...flattenPropertyTypesWithPath(node.children, path));
    }
  }
  return out;
}

/**
 * Flattened tree of property types with breadcrumb paths, intended for the
 * AI to pick a valid leaf `type_id` for a scraped property.
 */
export function buildEstateWebAiPropertyTypeCatalog(): EstateWebAiPropertyTypeEntry[] {
  return flattenPropertyTypesWithPath(ESTATEWEB_INIT_PROPERTY_TYPES, '');
}
