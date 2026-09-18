import { ActivityChangeOperation } from 'generated/prisma';
import { FieldChange } from '../interfaces/activity-log.interface';
import { isSensitiveKey } from './redact.util';

/** Fields that change on every write and carry no audit value. */
const IGNORED_KEYS: ReadonlySet<string> = new Set(['updated_at']);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Field-level diff between two entity snapshots (raw, pre-redaction). Nested objects are diffed
 * by dotted path; arrays are compared and reported as whole values. A missing side (create /
 * delete) is treated as an empty object so every populated field shows up as a change.
 * Fields with a sensitive key are reported as `{ path, redacted: true }` without either value.
 */
export function computeChanges(before: unknown, after: unknown): FieldChange[] {
  const changes: FieldChange[] = [];
  diffValues('', normalize(before) ?? {}, normalize(after) ?? {}, changes);
  return changes;
}

/** Infers what happened to an entity from which sides exist and whether any field changed. */
export function inferOperation(
  before: unknown,
  after: unknown,
  changes: FieldChange[],
): ActivityChangeOperation {
  if (before == null && after != null) return ActivityChangeOperation.CREATE;
  if (before != null && after == null) return ActivityChangeOperation.DELETE;
  return changes.length > 0
    ? ActivityChangeOperation.UPDATE
    : ActivityChangeOperation.ACTION;
}

function diffValues(
  path: string,
  a: Json,
  b: Json,
  out: FieldChange[],
): void {
  if (deepEqual(a, b)) return;

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (IGNORED_KEYS.has(key)) continue;
      const childPath = path ? `${path}.${key}` : key;
      const from = a[key] ?? null;
      const to = b[key] ?? null;
      if (isSensitiveKey(key)) {
        if (!deepEqual(from, to)) out.push({ path: childPath, redacted: true });
        continue;
      }
      diffValues(childPath, from, to, out);
    }
    return;
  }

  out.push({ path: path || '$', from: a, to: b });
}

/** Dates -> ISO, Decimals/BigInts -> string, undefined -> null, so equality is structural. */
function normalize(value: unknown): Json | null {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'bigint':
      return value.toString();
    case 'function':
    case 'symbol':
      return null;
  }
  const obj = value as object;
  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
  }
  if (Array.isArray(obj)) return obj.map((item) => normalize(item));
  const withToJson = obj as { toJSON?: () => unknown };
  if (typeof withToJson.toJSON === 'function') {
    return normalize(withToJson.toJSON());
  }
  const out: { [key: string]: Json } = {};
  for (const [key, child] of Object.entries(obj)) {
    out[key] = normalize(child);
  }
  return out;
}

function isPlainObject(value: Json): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!deepEqual(a[key] ?? null, b[key] ?? null)) return false;
    }
    return true;
  }
  return false;
}
