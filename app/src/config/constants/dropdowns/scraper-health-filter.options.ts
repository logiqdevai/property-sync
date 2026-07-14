import {
  ScraperHealths,
  type ScraperHealth,
} from "@/features/scrapers/interfaces/scrapers.interfaces";

export const ScraperHealthFilterOptions: { id: ScraperHealth | "all"; label: string }[] = [
  { id: "all", label: "All health" },
  { id: ScraperHealths.EXCELLENT, label: "Excellent" },
  { id: ScraperHealths.GOOD, label: "Good" },
  { id: ScraperHealths.WARNING, label: "Warning" },
  { id: ScraperHealths.CRITICAL, label: "Critical" },
  { id: ScraperHealths.BROKEN, label: "Broken" },
];
