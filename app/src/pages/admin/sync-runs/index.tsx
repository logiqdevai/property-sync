import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Table, Select, ListBox, Pagination, useOverlayState } from "@heroui/react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import { Routes } from "@/routes/routes";
import { useAuthStore } from "@/stores/auth";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { useAdminUsers } from "@/features/users/hooks/use-admin-users";
import {
  useAdminCmsSyncRunIntegrations,
  useAdminCmsSyncRuns,
  useDeleteAdminCmsSyncRun,
} from "@/features/cms-sync-runs/hooks/use-cms-sync-runs";
import type {
  AdminCmsSyncRunListQuery,
  CmsSyncStatus,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";
import { CmsSyncStatusChip } from "./components/cms-sync-status-chip";
import { CmsSyncStatusFilterOptions } from "@/config/constants/dropdowns/cms-sync-status-filter.options";
import { formatDateTime } from "@/lib/date";

const SYNC_RUN_DELETE_ACTIONS: TableRowAction[] = [
  { id: "delete", label: "Delete", variant: "danger", icon: Trash2 },
];

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
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const role = useAuthStore((state) => state.role);
  const canDelete = role === RoleTypes.SUPER_ADMIN || role === RoleTypes.ADMIN;

  const [status, setStatus] = useState<CmsSyncStatus | "all">("all");
  const [userId, setUserId] = useState<string | "all">("all");
  const [integrationId, setIntegrationId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);

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
  const deleteRun = useDeleteAdminCmsSyncRun();

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

  const handleDelete = async () => {
    if (!deleteRunId) return;
    await deleteRun.mutateAsync(deleteRunId);
    setDeleteRunId(null);
  };

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
        <TableSkeleton rows={8} columns={canDelete ? 11 : 10} />
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
                  {canDelete ? <Table.Column>Options</Table.Column> : null}
                </Table.Header>
                <Table.Body>
                  {runs.map((run) => (
                    <Table.Row
                      key={run.id}
                      id={run.id}
                      onAction={() => navigate(Routes.admin.syncRuns.detail(run.id))}
                      className="cursor-pointer"
                    >
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
                      {canDelete ? (
                        <Table.Cell>
                          <TableRowActionsMenu
                            actions={SYNC_RUN_DELETE_ACTIONS}
                            onAction={(actionId) => {
                              if (actionId !== "delete") return;
                              setDeleteRunId(run.id);
                              deleteConfirm.open();
                            }}
                            ariaLabel={`Actions for sync run ${run.id}`}
                          />
                        </Table.Cell>
                      ) : null}
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

      {canDelete ? (
        <ConfirmationDialog
          state={deleteConfirm}
          title="Delete this sync run?"
          description="This will permanently delete the CMS sync run record. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          isPending={deleteRun.isPending}
        />
      ) : null}
    </div>
  );
}
