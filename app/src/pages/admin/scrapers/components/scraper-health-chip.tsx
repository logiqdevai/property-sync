import { Chip } from "@heroui/react";
import { ScraperHealthFilterOptions } from "@/config/constants/dropdowns/scrapers/scraper-health-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { ScraperHealths, type ScraperHealth } from "@/features/scrapers/interfaces/scrapers.interfaces";

const healthColor: Record<ScraperHealth, "success" | "warning" | "danger"> = {
  [ScraperHealths.EXCELLENT]: "success",
  [ScraperHealths.GOOD]: "success",
  [ScraperHealths.WARNING]: "warning",
  [ScraperHealths.CRITICAL]: "danger",
  [ScraperHealths.BROKEN]: "danger",
};

interface ScraperHealthChipProps {
  health: ScraperHealth;
}

export function ScraperHealthChip({ health }: ScraperHealthChipProps) {
  return (
    <Chip color={healthColor[health]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(ScraperHealthFilterOptions, health)}</Chip.Label>
    </Chip>
  );
}
