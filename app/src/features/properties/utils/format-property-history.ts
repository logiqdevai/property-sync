import type { PropertyHistoryEntry } from "../interfaces/properties.interfaces";

type PropertyHistoryLabelInput = Pick<
  PropertyHistoryEntry,
  "event_type" | "old_value" | "new_value"
>;

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

export function formatPropertyHistoryLabel(entry: PropertyHistoryLabelInput): string {
  switch (entry.event_type) {
    case "CREATED":
      return "Property created from crawl";
    case "UPDATED":
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
