import { EstateWebFieldType } from '@/integrations/estateweb/constants/estateweb-enums.constants';
import {
  getEstateWebFieldOptionName,
  getEstateWebInitField,
  getEstateWebPropertyTypeNamePath,
} from '@/integrations/estateweb/utils/estateweb-init-lookup.util';
import {
  getEstateWebEnergyClassName,
  getEstateWebRoadTypeName,
  getEstateWebScopeName,
} from '@/integrations/estateweb/utils/estateweb-catalog.util';
import {
  CmsPropertyFieldDisplayEntry,
  CmsPropertyFieldEntry,
} from '../interfaces/cms-property.interface';
import {
  extractEstateWebEnergyClassId,
  extractEstateWebRoadTypeId,
} from './property-cms-field-mapper.util';

function formatCmsFieldDisplayValue(
  fieldId: number,
  rawValue: string | number,
): string {
  const field = getEstateWebInitField(fieldId);
  if (!field) return String(rawValue);

  switch (field.type_id) {
    case EstateWebFieldType.BOOLEAN:
      return rawValue === 1 || rawValue === '1' ? 'Yes' : 'No';
    case EstateWebFieldType.SELECT: {
      const optionId =
        typeof rawValue === 'number'
          ? rawValue
          : Number.parseInt(String(rawValue), 10);
      if (Number.isFinite(optionId)) {
        return (
          getEstateWebFieldOptionName(fieldId, optionId) ?? String(rawValue)
        );
      }
      return String(rawValue);
    }
    default:
      return String(rawValue);
  }
}

export function serializeCmsFieldEntry(
  entry: CmsPropertyFieldEntry,
): CmsPropertyFieldDisplayEntry | null {
  const field = getEstateWebInitField(entry.id);
  if (!field) return null;

  if (field.type_id === EstateWebFieldType.BOOLEAN) {
    if (entry.value !== 1 && entry.value !== '1') return null;
    return { name: field.name, value: 'Yes' };
  }

  return {
    name: field.name,
    value: formatCmsFieldDisplayValue(entry.id, entry.value),
  };
}

export function serializeCmsFieldsForApi(
  cmsFields: unknown,
): CmsPropertyFieldDisplayEntry[] | null {
  if (!Array.isArray(cmsFields)) return null;

  const serialized = cmsFields
    .map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof (entry as CmsPropertyFieldEntry).id !== 'number'
      ) {
        return null;
      }
      const typed = entry as CmsPropertyFieldEntry;
      if (typed.value == null || typed.value === '') return null;
      return serializeCmsFieldEntry(typed);
    })
    .filter((entry): entry is CmsPropertyFieldDisplayEntry => entry != null);

  return serialized.length > 0 ? serialized : null;
}

export function serializePropertyForApi<T extends Record<string, unknown>>(
  property: T,
): T & {
  estateweb_type_name: string | null;
  estateweb_location_name: string | null;
  estateweb_scope_name: string | null;
  estateweb_energy_class_id: number | null;
  estateweb_energy_class_name: string | null;
  estateweb_road_type_id: number | null;
  estateweb_road_type_name: string | null;
} {
  const estatewebTypeId =
    typeof property.estateweb_type_id === 'number'
      ? property.estateweb_type_id
      : null;
  const estatewebScopeId =
    typeof property.estateweb_scope_id === 'number'
      ? property.estateweb_scope_id
      : null;
  const estatewebEnergyClassId = extractEstateWebEnergyClassId(
    property.cms_fields,
  );
  const estatewebRoadTypeId = extractEstateWebRoadTypeId(property.cms_fields);

  return {
    ...property,
    estateweb_type_name: estatewebTypeId
      ? (getEstateWebPropertyTypeNamePath(estatewebTypeId) ?? null)
      : null,
    estateweb_location_name: null,
    estateweb_scope_name: estatewebScopeId
      ? (getEstateWebScopeName(estatewebScopeId) ?? null)
      : null,
    estateweb_energy_class_id: estatewebEnergyClassId,
    estateweb_energy_class_name: estatewebEnergyClassId
      ? (getEstateWebEnergyClassName(estatewebEnergyClassId) ?? null)
      : null,
    estateweb_road_type_id: estatewebRoadTypeId,
    estateweb_road_type_name: estatewebRoadTypeId
      ? (getEstateWebRoadTypeName(estatewebRoadTypeId) ?? null)
      : null,
    cms_fields: serializeCmsFieldsForApi(property.cms_fields),
  };
}
