import type { ScraperStatus } from "@/features/scrapers/interfaces/scrapers.interfaces";
import { ScraperStatusFormOptions } from "@/config/constants/dropdowns/scrapers/scraper-status-form.options";

export const ScraperStatusFilterOptions: { id: ScraperStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  ...ScraperStatusFormOptions,
];
