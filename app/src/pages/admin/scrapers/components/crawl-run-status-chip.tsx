import { Chip } from "@heroui/react";
import { CrawlRunStatuses, type CrawlRunStatus } from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";

const statusColor: Record<CrawlRunStatus, "success" | "default" | "warning" | "danger"> = {
  [CrawlRunStatuses.QUEUED]: "default",
  [CrawlRunStatuses.RUNNING]: "warning",
  [CrawlRunStatuses.SUCCESS]: "success",
  [CrawlRunStatuses.PARTIAL_SUCCESS]: "warning",
  [CrawlRunStatuses.FAILED]: "danger",
  [CrawlRunStatuses.CANCELLED]: "default",
};

const statusLabel: Record<CrawlRunStatus, string> = {
  [CrawlRunStatuses.QUEUED]: "Queued",
  [CrawlRunStatuses.RUNNING]: "Running",
  [CrawlRunStatuses.SUCCESS]: "Success",
  [CrawlRunStatuses.PARTIAL_SUCCESS]: "Partial success",
  [CrawlRunStatuses.FAILED]: "Failed",
  [CrawlRunStatuses.CANCELLED]: "Cancelled",
};

interface CrawlRunStatusChipProps {
  status: CrawlRunStatus;
}

export function CrawlRunStatusChip({ status }: CrawlRunStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{statusLabel[status]}</Chip.Label>
    </Chip>
  );
}
