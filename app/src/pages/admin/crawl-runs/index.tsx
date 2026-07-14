import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Select, ListBox, Pagination } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { useScrapers } from "@/features/scrapers/hooks/use-scrapers";
import { CrawlRunStatusChip } from "./components/crawl-run-status-chip";
import { useCrawlRuns } from "@/features/crawl-runs/hooks/use-crawl-runs";
import {
  CrawlRunStatuses,
  type CrawlRunListQuery,
  type CrawlRunStatus,
} from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";
import { formatDateTime } from "@/lib/date";

const statusFilterOptions: { id: CrawlRunStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: CrawlRunStatuses.QUEUED, label: "Queued" },
  { id: CrawlRunStatuses.RUNNING, label: "Running" },
  { id: CrawlRunStatuses.SUCCESS, label: "Success" },
  { id: CrawlRunStatuses.PARTIAL_SUCCESS, label: "Partial success" },
  { id: CrawlRunStatuses.FAILED, label: "Failed" },
  { id: CrawlRunStatuses.CANCELLED, label: "Cancelled" },
];

function toStartOfDayIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

export default function CrawlRunsListPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<CrawlRunStatus | "all">("all");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [scraperId, setScraperId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<CrawlRunListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(agencyId !== "all" && { agency_id: agencyId }),
      ...(scraperId !== "all" && { scraper_id: scraperId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, status, agencyId, scraperId, dateFrom, dateTo],
  );

  const { data, isPending } = useCrawlRuns(query);
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const { data: scrapersData } = useScrapers({ limit: 100 });

  const runs = data?.data ?? [];
  const pagination = data?.pagination;
  const agencies = agenciesData?.data ?? [];
  const scrapers = scrapersData?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Crawl runs</p>
        <p className="text-sm text-muted">Production Playwright executions against source agencies.</p>
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
              {statusFilterOptions.map((option) => (
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
              {agencies.map((agency) => (
                <ListBox.Item key={agency.id} id={agency.id}>
                  {agency.name}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by scraper"
          selectedKey={scraperId}
          onSelectionChange={(key) => {
            setPage(1);
            setScraperId(key as string | "all");
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
                All scrapers
              </ListBox.Item>
              {scrapers.map((scraper) => (
                <ListBox.Item key={scraper.id} id={scraper.id}>
                  {scraper.name}
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
        <TableSkeleton rows={8} columns={7} />
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
                  <Table.Column>Scraper</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Totals</Table.Column>
                  <Table.Column>Started</Table.Column>
                  <Table.Column>Finished</Table.Column>
                </Table.Header>
                <Table.Body>
                  {runs.map((run) => (
                    <Table.Row
                      key={run.id}
                      id={run.id}
                      onAction={() => navigate(Routes.admin.crawlRuns.detail(run.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell>
                        <span className="font-medium text-foreground">
                          {run.source_agency?.name ?? "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{run.scraper?.name ?? "—"}</Table.Cell>
                      <Table.Cell>
                        <CrawlRunStatusChip status={run.status} />
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-xs text-muted font-mono">
                          {run.total_found}/{run.total_created}/{run.total_updated}/
                          {run.total_removed}/{run.total_failed}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(run.started_at)}</Table.Cell>
                      <Table.Cell>{formatDateTime(run.finished_at)}</Table.Cell>
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
