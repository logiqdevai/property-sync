import { ListingType } from 'generated/prisma';
import { EstateWebFieldType, EstateWebScope } from '../constants/estateweb-enums.constants';
import { EstateWebSelectFieldId } from '../constants/estateweb-field-options.constants';
import {
  ESTATEWEB_INIT_FIELDS,
  ESTATEWEB_INIT_PROPERTY_TYPES,
  EstateWebInitPropertyType,
} from '../constants/estateweb-init.constants';
import {
  EstateWebFlatCatalogItem,
  EstateWebPropertyTypeCatalogItem,
} from '../interfaces/estateweb-catalog.interface';

function compareByName<T extends { name: string }>(a: T, b: T) {
  return a.name.localeCompare(b.name, 'el', { numeric: true, sensitivity: 'base' });
}

function flattenPropertyTypeCatalog(
  nodes: EstateWebInitPropertyType[],
  prefix: string,
): EstateWebPropertyTypeCatalogItem[] {
  const out: EstateWebPropertyTypeCatalogItem[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix} > ${node.name}` : node.name;
    const hasChildren = node.children.length > 0;
    out.push({
      id: node.id,
      name: node.name,
      parent_id: node.parent_id,
      path,
      has_children: hasChildren,
      is_leaf: !hasChildren,
    });
    if (hasChildren) {
      out.push(...flattenPropertyTypeCatalog(node.children, path));
    }
  }
  return out;
}

function buildSelectFieldCatalog(
  fieldId: EstateWebSelectFieldId,
): EstateWebFlatCatalogItem[] {
  const field = ESTATEWEB_INIT_FIELDS.find((entry) => entry.id === fieldId);
  if (!field) return [];
  return field.field_options
    .map((option) => ({
      id: option.id,
      name: option.name,
    }))
    .sort(compareByName);
}

const FLOOR_CATALOG: EstateWebFlatCatalogItem[] = buildSelectFieldCatalog(
  EstateWebSelectFieldId.FLOOR,
);

const ENERGY_CLASS_CATALOG: EstateWebFlatCatalogItem[] = buildSelectFieldCatalog(
  EstateWebSelectFieldId.ENERGY_CLASS,
);

const ROAD_TYPE_CATALOG: EstateWebFlatCatalogItem[] = buildSelectFieldCatalog(
  EstateWebSelectFieldId.ROAD_TYPE,
);

const FEATURES_CATALOG: EstateWebFlatCatalogItem[] = ESTATEWEB_INIT_FIELDS.filter(
  (field) => field.type_id === EstateWebFieldType.BOOLEAN,
)
  .map((field) => ({
    id: field.id,
    name: field.name,
  }))
  .sort(compareByName);

const LISTING_TYPE_CATALOG: EstateWebFlatCatalogItem[] = [
  { id: EstateWebScope.SALE, name: 'Πώληση' },
  { id: EstateWebScope.RENT, name: 'Ενοικίαση' },
];

const ESTATEWEB_PROPERTY_TYPE_CATALOG = flattenPropertyTypeCatalog(
  ESTATEWEB_INIT_PROPERTY_TYPES,
  '',
);

export function listEstateWebFloorCatalog(): EstateWebFlatCatalogItem[] {
  return FLOOR_CATALOG;
}

export function listEstateWebEnergyClassCatalog(): EstateWebFlatCatalogItem[] {
  return ENERGY_CLASS_CATALOG;
}

export function listEstateWebRoadTypeCatalog(): EstateWebFlatCatalogItem[] {
  return ROAD_TYPE_CATALOG;
}

export function listEstateWebFeaturesCatalog(): EstateWebFlatCatalogItem[] {
  return FEATURES_CATALOG;
}

export function listEstateWebListingTypeCatalog(): EstateWebFlatCatalogItem[] {
  return LISTING_TYPE_CATALOG;
}

export function listEstateWebPropertyTypeCatalog(): EstateWebPropertyTypeCatalogItem[] {
  return ESTATEWEB_PROPERTY_TYPE_CATALOG;
}

export function getEstateWebFloorName(optionId: number): string | undefined {
  return FLOOR_CATALOG.find((option) => option.id === optionId)?.name;
}

export function getEstateWebEnergyClassName(
  optionId: number,
): string | undefined {
  return ENERGY_CLASS_CATALOG.find((option) => option.id === optionId)?.name;
}

export function getEstateWebRoadTypeName(optionId: number): string | undefined {
  return ROAD_TYPE_CATALOG.find((option) => option.id === optionId)?.name;
}

export function getEstateWebFeatureName(fieldId: number): string | undefined {
  return FEATURES_CATALOG.find((feature) => feature.id === fieldId)?.name;
}

export function getEstateWebScopeName(scopeId: number): string | undefined {
  return LISTING_TYPE_CATALOG.find((scope) => scope.id === scopeId)?.name;
}

export function getEstateWebInitPropertyTypePath(
  typeId: number,
): string | undefined {
  return ESTATEWEB_PROPERTY_TYPE_CATALOG.find((type) => type.id === typeId)?.path;
}

export function resolveEstateWebScopeId(
  listingType?: ListingType | null,
  estatewebScopeId?: number | null,
): number | null {
  if (
    estatewebScopeId === EstateWebScope.SALE ||
    estatewebScopeId === EstateWebScope.RENT
  ) {
    return estatewebScopeId;
  }
  if (listingType === ListingType.RENT || listingType === ListingType.SHORT_TERM_RENT) {
    return EstateWebScope.RENT;
  }
  if (listingType === ListingType.SALE) {
    return EstateWebScope.SALE;
  }
  return null;
}

export function listingTypeFromEstateWebScopeId(
  scopeId: number,
): ListingType {
  if (scopeId === EstateWebScope.RENT) return ListingType.RENT;
  if (scopeId === EstateWebScope.SALE) return ListingType.SALE;
  return ListingType.UNKNOWN;
}
