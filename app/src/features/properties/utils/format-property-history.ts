import type { PropertyHistoryEntry } from "../interfaces/properties.interfaces";

type PropertyHistoryLabelInput = Pick<
  PropertyHistoryEntry,
  "event_type" | "field" | "old_value" | "new_value"
>;

const ALWAYS_COLLAPSE_FIELDS = new Set([
  "cms_fields",
  "cms_metadata",
  "description",
  "features",
]);

const LONG_DETAIL_THRESHOLD = 120;

export function formatPropertyHistoryValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return value.join(", ");
    }
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function formatPropertyHistoryValuePretty(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return value.join(", ");
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function formatPropertyHistorySummary(entry: PropertyHistoryLabelInput): string {
  switch (entry.event_type) {
    case "CREATED":
      return "Property created from crawl";
    case "UPDATED":
      if (entry.field) {
        return `${entry.field} changed`;
      }
      return "Property details updated";
    case "PRICE_CHANGED":
      return "Price changed";
    case "IMAGE_ADDED":
      return "Images added";
    case "IMAGE_REMOVED":
      return "Images removed";
    case "STATUS_CHANGED":
      return "Status changed";
    case "REMOVED":
      return "Listing removed from source";
    case "REAPPEARED":
      return "Listing reappeared on source";
    default:
      return entry.event_type;
  }
}

export function formatPropertyHistoryDetail(
  entry: PropertyHistoryLabelInput,
  pretty = false,
): string | null {
  const hasOld = entry.old_value != null;
  const hasNew = entry.new_value != null;
  if (!hasOld && !hasNew) return null;

  const formatValue = pretty
    ? formatPropertyHistoryValuePretty
    : formatPropertyHistoryValue;
  const from = formatValue(entry.old_value);
  const to = formatValue(entry.new_value);

  if (entry.field) {
    return `${entry.field}:\n${from}\n→\n${to}`;
  }

  return `${from}\n→\n${to}`;
}

export function shouldCollapsePropertyHistoryDetail(
  entry: PropertyHistoryLabelInput,
): boolean {
  if (entry.field && ALWAYS_COLLAPSE_FIELDS.has(entry.field)) {
    return entry.old_value != null || entry.new_value != null;
  }

  const from = formatPropertyHistoryValue(entry.old_value);
  const to = formatPropertyHistoryValue(entry.new_value);
  if (entry.old_value == null && entry.new_value == null) return false;

  const compactLength =
    (entry.field ? entry.field.length + 2 : 0) + from.length + to.length + 3;
  return compactLength > LONG_DETAIL_THRESHOLD;
}

export function formatPropertyHistoryLabel(entry: PropertyHistoryLabelInput): string {
  switch (entry.event_type) {
    case "CREATED":
      return "Property created from crawl";
    case "UPDATED":
      if (entry.field) {
        return `${entry.field} changed from ${formatPropertyHistoryValue(entry.old_value)} to ${formatPropertyHistoryValue(entry.new_value)}`;
      }
      return "Property details updated";
    case "PRICE_CHANGED":
      return `Price changed from ${formatPropertyHistoryValue(entry.old_value)} to ${formatPropertyHistoryValue(entry.new_value)}`;
    case "IMAGE_ADDED":
      return "Images added";
    case "IMAGE_REMOVED":
      return "Images removed";
    case "STATUS_CHANGED":
      return `Status changed from ${formatPropertyHistoryValue(entry.old_value)} to ${formatPropertyHistoryValue(entry.new_value)}`;
    case "REMOVED":
      return "Listing removed from source";
    case "REAPPEARED":
      return "Listing reappeared on source";
    default:
      return entry.event_type;
  }
}
