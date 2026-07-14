import { Chip } from "@heroui/react";
import { ScraperStatuses, type ScraperStatus } from "@/features/scrapers/interfaces/scrapers.interfaces";

const statusColor: Record<ScraperStatus, "success" | "default" | "warning" | "danger"> = {
  [ScraperStatuses.ACTIVE]: "success",
  [ScraperStatuses.TESTING]: "warning",
  [ScraperStatuses.INACTIVE]: "default",
  [ScraperStatuses.DEPRECATED]: "default",
  [ScraperStatuses.BROKEN]: "danger",
};

const statusLabel: Record<ScraperStatus, string> = {
  [ScraperStatuses.ACTIVE]: "Active",
  [ScraperStatuses.TESTING]: "Testing",
  [ScraperStatuses.INACTIVE]: "Inactive",
  [ScraperStatuses.DEPRECATED]: "Deprecated",
  [ScraperStatuses.BROKEN]: "Broken",
};

interface ScraperStatusChipProps {
  status: ScraperStatus;
}

export function ScraperStatusChip({ status }: ScraperStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{statusLabel[status]}</Chip.Label>
    </Chip>
  );
}
