import type { PropertyHistoryEntry } from "../interfaces/properties.interfaces";

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  return JSON.stringify(value);
}

export function formatPropertyHistoryLabel(entry: PropertyHistoryEntry): string {
  switch (entry.event_type) {
    case "CREATED":
      return "Property created from crawl";
    case "UPDATED":
      return "Property details updated";
    case "PRICE_CHANGED":
      return `Price changed from ${formatValue(entry.old_value)} to ${formatValue(entry.new_value)}`;
    case "IMAGE_ADDED":
      return "Images added";
    case "IMAGE_REMOVED":
      return "Images removed";
    case "STATUS_CHANGED":
      return `Status changed from ${formatValue(entry.old_value)} to ${formatValue(entry.new_value)}`;
    case "REMOVED":
      return "Listing removed from source";
    case "REAPPEARED":
      return "Listing reappeared on source";
    default:
      return entry.event_type;
  }
}
