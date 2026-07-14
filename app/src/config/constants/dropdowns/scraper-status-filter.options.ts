import {
  ScraperStatuses,
  type ScraperStatus,
} from "@/features/scrapers/interfaces/scrapers.interfaces";

export const ScraperStatusFilterOptions: { id: ScraperStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: ScraperStatuses.ACTIVE, label: "Active" },
  { id: ScraperStatuses.TESTING, label: "Testing" },
  { id: ScraperStatuses.INACTIVE, label: "Inactive" },
  { id: ScraperStatuses.DEPRECATED, label: "Deprecated" },
  { id: ScraperStatuses.BROKEN, label: "Broken" },
];
