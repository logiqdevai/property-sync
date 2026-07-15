import {
  ScraperStatuses,
  type ScraperStatus,
} from "@/features/scrapers/interfaces/scrapers.interfaces";

export const ScraperStatusFormOptions: { id: ScraperStatus; label: string }[] = [
  { id: ScraperStatuses.ACTIVE, label: "Active" },
  { id: ScraperStatuses.TESTING, label: "Testing" },
  { id: ScraperStatuses.INACTIVE, label: "Inactive" },
  { id: ScraperStatuses.DEPRECATED, label: "Deprecated" },
  { id: ScraperStatuses.BROKEN, label: "Broken" },
];

export function getScraperStatusLabel(status: ScraperStatus | string): string {
  return ScraperStatusFormOptions.find((option) => option.id === status)?.label ?? status;
}
