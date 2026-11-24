import {
  getEstateWebFieldOptionName,
  getEstateWebInitField,
  getEstateWebPropertyTypeNamePath,
} from '@/integrations/estateweb/utils/estateweb-init-lookup.util';
import { getEstateWebLocationNamePath } from '@/integrations/estateweb/utils/estateweb-location-lookup.util';

type CmsEntry = { id: number; value: unknown };

function toEntries(value: unknown): CmsEntry[] | null {
  if (!Array.isArray(value)) return null;
  const out: CmsEntry[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as CmsEntry).id === 'number'
    ) {
      out.push(item as CmsEntry);
    }
  }
  return out;
}

function describeValue(entry: CmsEntry): string {
  const raw = entry.value;
  if (raw === 1 || raw === '1') {
    const field = getEstateWebInitField(entry.id);
    // Boolean features/amenities: the name alone says it all.
    if (!field || field.field_options.length === 0) return 'Yes';
  }
  const asNumber =
    typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (Number.isFinite(asNumber) && String(asNumber) === String(raw)) {
    const optionName = getEstateWebFieldOptionName(entry.id, asNumber);
    if (optionName) return optionName;
  }
  return String(raw);
}

function describeEntry(entry: CmsEntry): string {
  const name = getEstateWebInitField(entry.id)?.name ?? `Field #${entry.id}`;
  return `${name}: ${describeValue(entry)}`;
}

function lookupName(field: string, value: unknown): unknown {
  if (value == null) return value;
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(id)) return value;
  if (field === 'estateweb_type_id') {
    return getEstateWebPropertyTypeNamePath(id) ?? value;
  }
  if (field === 'estateweb_location_id') {
    return getEstateWebLocationNamePath(id) ?? value;
  }
  return value;
}

/**
 * Make any property-history change readable: EstateWeb ids become names and
 * cms_fields shows only the entries that changed. Returns `null` when the
 * change has nothing to show (cms_fields reordered only).
 */
export function humanizeHistoryChange(
  field: string | null,
  oldValue: unknown,
  newValue: unknown,
): { old_value: unknown; new_value: unknown } | null {
  if (field === 'cms_fields') {
    const change = humanizeCmsFieldsChange(oldValue, newValue);
    if (!change) return { old_value: oldValue, new_value: newValue };
    if (!change.old_value && !change.new_value) return null;
    return change;
  }
  if (field === 'estateweb_type_id' || field === 'estateweb_location_id') {
    return {
      old_value: lookupName(field, oldValue),
      new_value: lookupName(field, newValue),
    };
  }
  if (
    field === 'cms_metadata' &&
    oldValue &&
    newValue &&
    typeof oldValue === 'object' &&
    typeof newValue === 'object'
  ) {
    const o = oldValue as Record<string, unknown>;
    const n = newValue as Record<string, unknown>;
    const fmt = (m: Record<string, unknown>, keys: string[]) =>
      keys.map((k) => `${k}: ${String(m[k])}`);
    const changed = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter(
      (k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]),
    );
    return {
      old_value: fmt(o, changed.filter((k) => k in o)),
      new_value: fmt(n, changed.filter((k) => k in n)),
    };
  }
  return { old_value: oldValue, new_value: newValue };
}

/** Order-insensitive comparison key for a cms_fields array. */
export function cmsFieldsComparable(value: unknown): unknown {
  const entries = toEntries(value);
  if (!entries) return value;
  return [...entries]
    .sort((a, b) => a.id - b.id)
    .map((e) => ({ id: e.id, value: String(e.value) }));
}

/**
 * Reduce a cms_fields history entry to only what actually changed, with field
 * ids and option ids replaced by their EstateWeb names. Returns null for both
 * sides when the two lists differ only by order.
 */
export function humanizeCmsFieldsChange(
  oldValue: unknown,
  newValue: unknown,
): { old_value: string[] | null; new_value: string[] | null } | null {
  const oldEntries = toEntries(oldValue);
  const newEntries = toEntries(newValue);
  if (!oldEntries && !newEntries) return null;

  const oldById = new Map((oldEntries ?? []).map((e) => [e.id, e]));
  const newById = new Map((newEntries ?? []).map((e) => [e.id, e]));

  const removed: string[] = [];
  const added: string[] = [];
  for (const [id, oldEntry] of oldById) {
    const next = newById.get(id);
    if (!next) {
      removed.push(describeEntry(oldEntry));
    } else if (String(next.value) !== String(oldEntry.value)) {
      removed.push(describeEntry(oldEntry));
      added.push(describeEntry(next));
    }
  }
  for (const [id, newEntry] of newById) {
    if (!oldById.has(id)) added.push(describeEntry(newEntry));
  }

  return {
    old_value: removed.length ? removed : null,
    new_value: added.length ? added : null,
  };
}
