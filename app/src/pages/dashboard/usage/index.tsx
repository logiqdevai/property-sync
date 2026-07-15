import { useMemo, useState } from "react";
import { Table, Select, ListBox, Pagination } from "@heroui/react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useTrackableAgencies } from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { useUsage } from "@/features/usage/hooks/use-usage";
import type { UsageQuery } from "@/features/usage/interfaces/usage.interfaces";
import type { CrawlRunStatus } from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";
import { CrawlRunStatusChip } from "@/pages/admin/crawl-runs/components/crawl-run-status-chip";
import { CrawlRunStatusFilterOptions } from "@/config/constants/dropdowns/crawl-run-status-filter.options";
import { formatDateTime } from "@/lib/date";

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

export default function DashboardUsagePage() {
  const [status, setStatus] = useState<CrawlRunStatus | "all">("all");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<UsageQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(agencyId !== "all" && { agency_id: agencyId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, status, agencyId, dateFrom, dateTo],
  );

  const { data, isPending } = useUsage(query);
  const { data: agenciesData } = useTrackableAgencies({ limit: 100 });

  const runs = data?.data ?? [];
  const pagination = data?.pagination;
  const trackedAgencies = (agenciesData?.data ?? []).filter((agency) => agency.is_tracked);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Usage</p>
        <p className="text-sm text-muted">AI token costs for your crawl runs.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-2 w-fit">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Total cost (filtered)
        </p>
        <p className="font-mono text-3xl font-bold text-foreground">
          {isPending ? "—" : formatUsd(data?.total_cost ?? null)}
        </p>
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
          aria-label="Filter by agency"
          selectedKey={agencyId}
          onSelectionChange={(key) => {
            setPage(1);
            setAgencyId(key as string | "all");
          }}
          className="w-48"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item key="all" id="all">
                All agencies
              </ListBox.Item>
              {trackedAgencies.map((agency) => (
                <ListBox.Item key={agency.id} id={agency.id}>
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
        <TableSkeleton rows={8} columns={6} />
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No crawl runs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Crawl run usage">
                <Table.Header>
                  <Table.Column isRowHeader>Agency</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>AI model</Table.Column>
                  <Table.Column>Tokens (in/out)</Table.Column>
                  <Table.Column>Total cost</Table.Column>
                  <Table.Column>Started</Table.Column>
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
                      <Table.Cell>{run.ai_model ?? "—"}</Table.Cell>
                      <Table.Cell>
                        <span className="text-xs text-muted font-mono">
                          {run.ai_input_tokens ?? 0}/{run.ai_output_tokens ?? 0}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">
                          {formatUsd(run.ai_total_cost)}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(run.started_at)}</Table.Cell>
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
