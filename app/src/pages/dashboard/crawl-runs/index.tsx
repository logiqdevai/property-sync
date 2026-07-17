import { useMemo, useState } from "react";
import { Table, Select, ListBox, Pagination } from "@heroui/react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useTrackableAgencies } from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { useUserCrawlRuns } from "@/features/crawl-runs/hooks/use-crawl-runs";
import type {
  CrawlRunStatus,
  UserCrawlRunListQuery,
} from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";
import { CrawlRunStatusChip } from "@/pages/admin/crawl-runs/components/crawl-run-status-chip";
import { CrawlRunStatusFilterOptions } from "@/config/constants/dropdowns/crawl-run-status-filter.options";
import { formatDateTime } from "@/lib/date";
import { formatDuration } from "@/lib/duration";

function toStartOfDayIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

function formatUsd(value: string | null) {
  if (!value) return "$0.000000";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toFixed(6)}`;
}

export default function DashboardCrawlRunsPage() {
  const [status, setStatus] = useState<CrawlRunStatus | "all">("all");
  const [trackedAgencyId, setTrackedAgencyId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<UserCrawlRunListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(trackedAgencyId !== "all" && { user_tracked_agency_id: trackedAgencyId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, status, trackedAgencyId, dateFrom, dateTo],
  );

  const { data, isPending } = useUserCrawlRuns(query);
  const { data: agenciesData } = useTrackableAgencies({ limit: 100 });

  const runs = data?.data ?? [];
  const pagination = data?.pagination;
  const trackedAgencies = (agenciesData?.data ?? []).filter(
    (agency) => agency.is_tracked && agency.user_tracked_agency_id,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Crawl runs</p>
        <p className="text-sm text-muted">Executions for the agencies you track.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select
          aria-label="Filter by status"
          selectedKey={status}
          onSelectionChange={(key) => {
            setPage(1);
            setStatus(key as CrawlRunStatus | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CrawlRunStatusFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by tracked agency"
          selectedKey={trackedAgencyId}
          onSelectionChange={(key) => {
            setPage(1);
            setTrackedAgencyId(key as string | "all");
          }}
          className="w-56"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item key="all" id="all">
                All tracked agencies
              </ListBox.Item>
              {trackedAgencies.map((agency) => (
                <ListBox.Item key={agency.user_tracked_agency_id!} id={agency.user_tracked_agency_id!}>
                  {agency.name}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          aria-label="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          aria-label="To date"
        />
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={9} />
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No crawl runs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Crawl runs">
                <Table.Header>
                  <Table.Column isRowHeader>Agency</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Created</Table.Column>
                  <Table.Column>Updated</Table.Column>
                  <Table.Column>Removed</Table.Column>
                  <Table.Column>Failed</Table.Column>
                  <Table.Column>AI cost</Table.Column>
                  <Table.Column>Started</Table.Column>
                  <Table.Column>Duration</Table.Column>
                </Table.Header>
                <Table.Body>
                  {runs.map((run) => (
                    <Table.Row key={run.id} id={run.id}>
                      <Table.Cell>
                        <span className="font-medium text-foreground">
                          {run.source_agency?.name ?? "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <CrawlRunStatusChip status={run.status} />
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">{run.total_created}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">{run.total_updated}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">{run.total_removed}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">{run.total_failed}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">
                          {formatUsd(run.ai_total_cost)}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(run.started_at)}</Table.Cell>
                      <Table.Cell>{formatDuration(run.duration_ms)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <Pagination>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                isDisabled={!pagination.has_prev}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Summary>
                Page {pagination.page} of {pagination.total_pages}
              </Pagination.Summary>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next
                isDisabled={!pagination.has_next}
                onPress={() => setPage((p) => p + 1)}
              >
                Next
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      )}
    </div>
  );
}
