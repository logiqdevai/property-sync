import { Chip } from "@heroui/react";
import { ScraperHealths, type ScraperHealth } from "@/features/scrapers/interfaces/scrapers.interfaces";

const healthColor: Record<ScraperHealth, "success" | "warning" | "danger"> = {
  [ScraperHealths.EXCELLENT]: "success",
  [ScraperHealths.GOOD]: "success",
  [ScraperHealths.WARNING]: "warning",
  [ScraperHealths.CRITICAL]: "danger",
  [ScraperHealths.BROKEN]: "danger",
};

const healthLabel: Record<ScraperHealth, string> = {
  [ScraperHealths.EXCELLENT]: "Excellent",
  [ScraperHealths.GOOD]: "Good",
  [ScraperHealths.WARNING]: "Warning",
  [ScraperHealths.CRITICAL]: "Critical",
  [ScraperHealths.BROKEN]: "Broken",
};

interface ScraperHealthChipProps {
  health: ScraperHealth;
}

export function ScraperHealthChip({ health }: ScraperHealthChipProps) {
  return (
    <Chip color={healthColor[health]} size="sm" variant="soft">
      <Chip.Label>{healthLabel[health]}</Chip.Label>
    </Chip>
  );
}
