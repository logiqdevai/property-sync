import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Checkbox,
  Table,
  Tabs,
  Select,
  ListBox,
  Pagination,
  useOverlayState,
  type Selection,
} from "@heroui/react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Trash2 } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TableRowActionsMenu, type TableRowAction } from "@/components/ui/table-row-actions-menu";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { useScrapers } from "@/features/scrapers/hooks/use-scrapers";
import { useAdminUsers } from "@/features/users/hooks/use-admin-users";
import { CrawlRunStatusChip } from "./components/crawl-run-status-chip";
import { CrawlRunsTimeline } from "./components/crawl-runs-timeline";
import {
  useCrawlRuns,
  useDeleteCrawlRun,
  useDeleteCrawlRuns,
} from "@/features/crawl-runs/hooks/use-crawl-runs";
import {
  type CrawlRunListQuery,
  type CrawlRunStatus,
} from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";
import { CrawlRunStatusFilterOptions } from "@/config/constants/dropdowns/agencies/crawl-run-status-filter.options";
import { formatDateTime } from "@/lib/date";
import { formatDuration } from "@/lib/duration";

const CRAWL_RUN_DELETE_ACTIONS: TableRowAction[] = [
  { id: "delete", label: "Delete", variant: "danger", icon: Trash2 },
];

const CRAWL_RUN_TAB_KEYS = {
  table: "table",
  timeline: "timeline",
} as const;

type CrawlRunTabKey = (typeof CRAWL_RUN_TAB_KEYS)[keyof typeof CRAWL_RUN_TAB_KEYS];

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

export default function CrawlRunsListPage() {
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();

  const [activeTab, setActiveTab] = useState<CrawlRunTabKey>(CRAWL_RUN_TAB_KEYS.table);
  const [status, setStatus] = useState<CrawlRunStatus | "all">("all");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [scraperId, setScraperId] = useState<string | "all">("all");
  const [userId, setUserId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [deleteCrawlRunId, setDeleteCrawlRunId] = useState<string | null>(null);

  const query = useMemo<CrawlRunListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(agencyId !== "all" && { agency_id: agencyId }),
      ...(scraperId !== "all" && { scraper_id: scraperId }),
      ...(userId !== "all" && { user_id: userId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, status, agencyId, scraperId, userId, dateFrom, dateTo],
  );

  const { data, isPending } = useCrawlRuns(query);
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const { data: scrapersData } = useScrapers({ limit: 100 });
  const { data: usersData } = useAdminUsers({ limit: 100 });
  const deleteCrawlRun = useDeleteCrawlRun();
  const deleteCrawlRuns = useDeleteCrawlRuns();

  const runs = data?.data ?? [];
  const pagination = data?.pagination;
  const agencies = agenciesData?.data ?? [];
  const scrapers = scrapersData?.data ?? [];
  const users = usersData?.data ?? [];
  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") {
      return new Set(runs.map((run) => run.id));
    }
    return new Set([...selectedKeys].map(String));
  }, [selectedKeys, runs]);
  const selectedCount = selectedIds.size;

  const clearSelection = () => setSelectedKeys(new Set());

  const handleDelete = async () => {
    if (!deleteCrawlRunId) return;
    await deleteCrawlRun.mutateAsync(deleteCrawlRunId);
    setSelectedKeys((prev) => {
      if (prev === "all") {
        return new Set(runs.map((run) => run.id).filter((id) => id !== deleteCrawlRunId));
      }
      const next = new Set(prev);
      next.delete(deleteCrawlRunId);
      return next;
    });
    setDeleteCrawlRunId(null);
  };

  const handleBulkDelete = async () => {
    await deleteCrawlRuns.mutateAsync({ crawl_run_ids: Array.from(selectedIds) });
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Crawl runs</p>
          <p className="text-sm text-muted">Production Playwright executions against source agencies.</p>
        </div>
      </div>

      <Tabs
        className="w-full"
        variant="secondary"
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as CrawlRunTabKey)}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Crawl run views">
            <Tabs.Tab id={CRAWL_RUN_TAB_KEYS.table}>
              Table
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id={CRAWL_RUN_TAB_KEYS.timeline}>
              Timeline
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id={CRAWL_RUN_TAB_KEYS.timeline} className="pt-6">
          <CrawlRunsTimeline />
        </Tabs.Panel>

        <Tabs.Panel id={CRAWL_RUN_TAB_KEYS.table} className="pt-6 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-2 w-fit">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Total cost
          </p>
          <p className="font-mono text-3xl font-bold text-foreground">
            {isPending ? "—" : formatUsd(data?.total_cost ?? null)}
          </p>
        </div>
        <Button
          variant="danger"
          isDisabled={selectedCount < 1}
          onPress={bulkDeleteConfirm.open}
        >
          Delete selected ({selectedCount})
        </Button>
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

        <Select
          aria-label="Filter by user"
          selectedKey={userId}
          onSelectionChange={(key) => {
            setPage(1);
            setUserId(key as string | "all");
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
                All users
              </ListBox.Item>
              {users.map((user) => (
                <ListBox.Item key={user.id} id={user.id}>
                  {user.email}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <DatePickerField
          aria-label="From date"
          value={dateFrom}
          onChange={(next) => {
            setPage(1);
            setDateFrom(next);
          }}
        />
        <DatePickerField
          aria-label="To date"
          value={dateTo}
          onChange={(next) => {
            setPage(1);
            setDateTo(next);
          }}
        />
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={8} />
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No crawl runs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Crawl runs"
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              >
                <Table.Header>
                  <Table.Column className="pr-0">
                    <Checkbox aria-label="Select all crawl runs on this page" slot="selection">
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Column>
                  <Table.Column isRowHeader>Agency</Table.Column>
                  <Table.Column>Scraper</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Totals</Table.Column>
                  <Table.Column>AI cost</Table.Column>
                  <Table.Column>Started</Table.Column>
                  <Table.Column>Duration</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {runs.map((run) => (
                    <Table.Row
                      key={run.id}
                      id={run.id}
                      onAction={() => navigate(Routes.admin.crawlRuns.detail(run.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell className="pr-0">
                        <Checkbox
                          aria-label={`Select crawl run ${run.id}`}
                          slot="selection"
                          variant="secondary"
                        >
                          <Checkbox.Content>
                            <Checkbox.Control>
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                          </Checkbox.Content>
                        </Checkbox>
                      </Table.Cell>
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
                        <span
                          className="text-xs text-muted font-mono"
                          title="found / new / refreshed"
                        >
                          {run.total_found}/{run.total_new_listings}/
                          {run.total_refreshed_listings}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">
                          {formatUsd(run.ai_total_cost)}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(run.started_at)}</Table.Cell>
                      <Table.Cell>{formatDuration(run.duration_ms)}</Table.Cell>
                      <Table.Cell>
                        <TableRowActionsMenu
                          actions={CRAWL_RUN_DELETE_ACTIONS}
                          onAction={(actionId) => {
                            if (actionId !== "delete") return;
                            setDeleteCrawlRunId(run.id);
                            deleteConfirm.open();
                          }}
                          ariaLabel={`Actions for crawl run ${run.id}`}
                        />
                      </Table.Cell>
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
        </Tabs.Panel>
      </Tabs>

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete this crawl run?"
        description="This will permanently delete the crawl run and its execution traces. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteCrawlRun.isPending}
      />

      <ConfirmationDialog
        state={bulkDeleteConfirm}
        title="Delete selected crawl runs?"
        description={`This will permanently delete ${selectedCount} crawl runs. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isPending={deleteCrawlRuns.isPending}
      />
    </div>
  );
}
