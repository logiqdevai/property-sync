import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";

export const PropertyStatusFormOptions: { id: PropertyStatus; label: string }[] = [
  { id: PropertyStatuses.ACTIVE, label: "Active" },
  { id: PropertyStatuses.INACTIVE, label: "Inactive" },
  { id: PropertyStatuses.REMOVED, label: "Removed" },
  { id: PropertyStatuses.SOLD, label: "Sold" },
  { id: PropertyStatuses.RENTED, label: "Rented" },
  { id: PropertyStatuses.UNKNOWN, label: "Unknown" },
];

export function getPropertyStatusLabel(status: PropertyStatus | string): string {
  return (
    PropertyStatusFormOptions.find((option) => option.id === status)?.label ??
    status
  );
}
