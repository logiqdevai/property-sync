import { Chip } from "@heroui/react";
import { CrawlRunStatusFilterOptions } from "@/config/constants/dropdowns/agencies/crawl-run-status-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { CrawlRunStatuses, type CrawlRunStatus } from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";

const statusColor: Record<CrawlRunStatus, "success" | "default" | "warning" | "danger"> = {
  [CrawlRunStatuses.QUEUED]: "default",
  [CrawlRunStatuses.RUNNING]: "warning",
  [CrawlRunStatuses.SUCCESS]: "success",
  [CrawlRunStatuses.PARTIAL_SUCCESS]: "warning",
  [CrawlRunStatuses.FAILED]: "danger",
  [CrawlRunStatuses.CANCELLED]: "default",
};

interface CrawlRunStatusChipProps {
  status: CrawlRunStatus;
}

export function CrawlRunStatusChip({ status }: CrawlRunStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(CrawlRunStatusFilterOptions, status)}</Chip.Label>
    </Chip>
  );
}
