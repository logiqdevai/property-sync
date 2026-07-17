import { useEffect, useMemo, useState } from "react";
import { Table, Select, ListBox, Pagination } from "@heroui/react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useAdminUsers } from "@/features/users/hooks/use-admin-users";
import {
  useAdminCmsSyncRunIntegrations,
  useAdminCmsSyncRuns,
} from "@/features/cms-sync-runs/hooks/use-cms-sync-runs";
import type {
  AdminCmsSyncRunListQuery,
  CmsSyncStatus,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";
import { CmsSyncStatusChip } from "./components/cms-sync-status-chip";
import { CmsSyncStatusFilterOptions } from "@/config/constants/dropdowns/cms-sync-status-filter.options";
import { formatDateTime } from "@/lib/date";

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

export default function AdminSyncRunsListPage() {
  const [status, setStatus] = useState<CmsSyncStatus | "all">("all");
  const [userId, setUserId] = useState<string | "all">("all");
  const [integrationId, setIntegrationId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<AdminCmsSyncRunListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(userId !== "all" && { user_id: userId }),
      ...(integrationId !== "all" && { user_integration_id: integrationId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, status, userId, integrationId, dateFrom, dateTo],
  );

  const { data, isPending } = useAdminCmsSyncRuns(query);
  const { data: usersData } = useAdminUsers({ limit: 100 });
  const { data: integrations } = useAdminCmsSyncRunIntegrations(
    userId !== "all" ? userId : undefined,
  );

  useEffect(() => {
    if (integrationId === "all" || !integrations) return;
    const stillValid = integrations.some((item) => item.id === integrationId);
    if (!stillValid) {
      setIntegrationId("all");
    }
  }, [integrations, integrationId]);

  const runs = data?.data ?? [];
  const pagination = data?.pagination;
  const users = usersData?.data ?? [];
  const integrationOptions = integrations ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Sync runs</p>
        <p className="text-sm text-muted">CMS push outcomes across EstateWeb integrations.</p>
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
          aria-label="Filter by user"
          selectedKey={userId}
          onSelectionChange={(key) => {
            setPage(1);
            setIntegrationId("all");
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
              {integrationOptions.map((connection) => (
                <ListBox.Item key={connection.id} id={connection.id}>
                  {connectionEmail(connection)}
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
        <TableSkeleton rows={8} columns={10} />
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
                  <Table.Column>User</Table.Column>
                  <Table.Column>Integration</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Created</Table.Column>
                  <Table.Column>Updated</Table.Column>
                  <Table.Column>Removed</Table.Column>
                  <Table.Column>Failed</Table.Column>
                  <Table.Column>Attempt</Table.Column>
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
                          {run.user_integration?.user?.email ?? "—"}
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
                        <span className="font-mono text-sm text-foreground">{run.total_failed}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">
                          {run.attempt}
                          {run.max_attempts != null ? `/${run.max_attempts}` : ""}
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
    </div>
  );
}
