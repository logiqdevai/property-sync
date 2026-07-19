import { useMemo, useState } from "react";
import { Table, Select, ListBox, Pagination, useOverlayState } from "@heroui/react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { CmsSyncRunFailuresModal } from "@/components/ui/cms-sync-run-failures-modal";
import { useUserIntegrationConnections } from "@/features/user-integrations/hooks/use-user-integrations";
import { useUserCmsSyncRuns } from "@/features/cms-sync-runs/hooks/use-cms-sync-runs";
import type {
  CmsSyncStatus,
  CmsSyncRun,
  CmsSyncRunListQuery,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";
import { CmsSyncStatusChip } from "./components/cms-sync-status-chip";
import { CmsSyncStatusFilterOptions } from "@/config/constants/dropdowns/cms-sync-status-filter.options";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { formatDateTime } from "@/lib/date";
import { durationMsFromRange, formatDuration } from "@/lib/duration";

function toStartOfDayIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

function connectionEmail(connection: {
  email: string | null;
  username: string | null;
}) {
  return connection.email || connection.username || "—";
}

export default function DashboardSyncRunsPage() {
  const failuresModal = useOverlayState();
  const [selectedRun, setSelectedRun] = useState<CmsSyncRun | null>(null);
  const [status, setStatus] = useState<CmsSyncStatus | "all">("all");
  const [integrationId, setIntegrationId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const openFailures = (run: CmsSyncRun) => {
    setSelectedRun(run);
    failuresModal.open();
  };

  const query = useMemo<CmsSyncRunListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(integrationId !== "all" && { user_integration_id: integrationId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, status, integrationId, dateFrom, dateTo],
  );

  const { data, isPending } = useUserCmsSyncRuns(query);
  const { data: connections } = useUserIntegrationConnections();

  const runs = data?.data ?? [];
  const pagination = data?.pagination;
  const integrationConnections = (connections ?? []).filter(
    (connection) => connection.integration_target.integration_type === IntegrationTypes.ESTATEWEB,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Sync runs</p>
        <p className="text-sm text-muted">CMS push outcomes for your connected integrations.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select
          aria-label="Filter by status"
          selectedKey={status}
          onSelectionChange={(key) => {
            setPage(1);
            setStatus(key as CmsSyncStatus | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CmsSyncStatusFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by integration"
          selectedKey={integrationId}
          onSelectionChange={(key) => {
            setPage(1);
            setIntegrationId(key as string | "all");
          }}
          className="w-64"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item key="all" id="all">
                All integrations
              </ListBox.Item>
              {integrationConnections.map((connection) => (
                <ListBox.Item key={connection.id} id={connection.id}>
                  {connectionEmail(connection)}
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
        <TableSkeleton rows={8} columns={9} />
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No sync runs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Sync runs">
                <Table.Header>
                  <Table.Column isRowHeader>Agency</Table.Column>
                  <Table.Column>Integration</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Created</Table.Column>
                  <Table.Column>Updated</Table.Column>
                  <Table.Column>Removed</Table.Column>
                  <Table.Column>Failed</Table.Column>
                  <Table.Column>Duration</Table.Column>
                  <Table.Column>Started</Table.Column>
                </Table.Header>
                <Table.Body>
                  {runs.map((run) => (
                    <Table.Row key={run.id} id={run.id}>
                      <Table.Cell>
                        <span className="font-medium text-foreground">
                          {run.crawl_run?.source_agency?.name ?? "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-sm text-foreground">
                          {run.user_integration
                            ? connectionEmail(run.user_integration)
                            : "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <CmsSyncStatusChip status={run.status} />
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
                        {run.total_failed > 0 ? (
                          <button
                            type="button"
                            className="font-mono text-sm text-danger hover:underline"
                            onClick={() => openFailures(run)}
                          >
                            {run.total_failed}
                          </button>
                        ) : (
                          <span className="font-mono text-sm text-foreground">{run.total_failed}</span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">
                          {formatDuration(durationMsFromRange(run.started_at, run.finished_at))}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(run.started_at ?? run.created_at)}</Table.Cell>
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

      <CmsSyncRunFailuresModal state={failuresModal} run={selectedRun} />
    </div>
  );
}
