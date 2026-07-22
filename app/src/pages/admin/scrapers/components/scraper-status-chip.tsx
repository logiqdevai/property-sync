import { Chip } from "@heroui/react";
import { ScraperStatusFilterOptions } from "@/config/constants/dropdowns/scrapers/scraper-status-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { ScraperStatuses, type ScraperStatus } from "@/features/scrapers/interfaces/scrapers.interfaces";

const statusColor: Record<ScraperStatus, "success" | "default" | "warning" | "danger"> = {
  [ScraperStatuses.ACTIVE]: "success",
  [ScraperStatuses.TESTING]: "warning",
  [ScraperStatuses.INACTIVE]: "default",
  [ScraperStatuses.DEPRECATED]: "default",
  [ScraperStatuses.BROKEN]: "danger",
};

interface ScraperStatusChipProps {
  status: ScraperStatus;
}

export function ScraperStatusChip({ status }: ScraperStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(ScraperStatusFilterOptions, status)}</Chip.Label>
    </Chip>
  );
}
