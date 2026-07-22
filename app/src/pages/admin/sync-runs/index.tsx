import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import {
  Checkbox,
  Table,
  Select,
  ListBox,
  Pagination,
  useOverlayState,
  type Selection,
} from "@heroui/react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { CmsSyncRunFailuresModal } from "@/components/ui/cms-sync-run-failures-modal";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
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
  useDeleteAdminCmsSyncRuns,
} from "@/features/cms-sync-runs/hooks/use-cms-sync-runs";
import type {
  AdminCmsSyncRunListQuery,
  CmsSyncRun,
  CmsSyncStatus,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";
import { CmsSyncStatusChip } from "./components/cms-sync-status-chip";
import { CmsSyncStatusFilterOptions } from "@/config/constants/dropdowns/integrations/cms-sync-status-filter.options";
import { formatDateTime } from "@/lib/date";
import { durationMsFromRange, formatDuration } from "@/lib/duration";

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
  const bulkDeleteConfirm = useOverlayState();
  const failuresModal = useOverlayState();
  const role = useAuthStore((state) => state.role);
  const canDelete = role === RoleTypes.SUPER_ADMIN || role === RoleTypes.ADMIN;

  const [status, setStatus] = useState<CmsSyncStatus | "all">("all");
  const [userId, setUserId] = useState<string | "all">("all");
  const [integrationId, setIntegrationId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<CmsSyncRun | null>(null);

  const openFailures = (run: CmsSyncRun) => {
    setSelectedRun(run);
    failuresModal.open();
  };

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
  const deleteRuns = useDeleteAdminCmsSyncRuns();

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
  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") {
      return new Set(runs.map((run) => run.id));
    }
    return new Set([...selectedKeys].map(String));
  }, [selectedKeys, runs]);
  const selectedCount = selectedIds.size;

  const bulkActions = useMemo<TableRowAction[]>(
    () => [
      {
        id: "delete",
        label: "Delete selected",
        variant: "danger",
        icon: Trash2,
        isDisabled: selectedCount < 1,
      },
    ],
    [selectedCount],
  );

  const clearSelection = () => setSelectedKeys(new Set());

  const handleDelete = async () => {
    if (!deleteRunId) return;
    await deleteRun.mutateAsync(deleteRunId);
    setSelectedKeys((prev) => {
      if (prev === "all") {
        return new Set(runs.map((run) => run.id).filter((id) => id !== deleteRunId));
      }
      const next = new Set(prev);
      next.delete(deleteRunId);
      return next;
    });
    setDeleteRunId(null);
  };

  const handleBulkDelete = async () => {
    await deleteRuns.mutateAsync({ cms_sync_run_ids: Array.from(selectedIds) });
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Sync runs</p>
          <p className="text-sm text-muted">CMS push outcomes across EstateWeb integrations.</p>
        </div>
        {canDelete ? (
          <BulkActionsMenu
            label={selectedCount > 0 ? `Actions (${selectedCount})` : "Actions"}
            actions={bulkActions}
            onAction={(actionId) => {
              if (actionId === "delete") {
                bulkDeleteConfirm.open();
              }
            }}
          />
        ) : null}
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
        <TableSkeleton rows={8} columns={canDelete ? 13 : 11} />
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No sync runs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Sync runs"
                selectionMode={canDelete ? "multiple" : undefined}
                selectedKeys={canDelete ? selectedKeys : undefined}
                onSelectionChange={canDelete ? setSelectedKeys : undefined}
              >
                <Table.Header>
                  {canDelete ? (
                    <Table.Column className="pr-0">
                      <Checkbox aria-label="Select all sync runs on this page" slot="selection">
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox.Content>
                      </Checkbox>
                    </Table.Column>
                  ) : null}
                  <Table.Column isRowHeader>Agency</Table.Column>
                  <Table.Column>User</Table.Column>
                  <Table.Column>Integration</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Created</Table.Column>
                  <Table.Column>Updated</Table.Column>
                  <Table.Column>Removed</Table.Column>
                  <Table.Column>Failed</Table.Column>
                  <Table.Column>Attempt</Table.Column>
                  <Table.Column>Duration</Table.Column>
                  <Table.Column>Started</Table.Column>
                  {canDelete ? <Table.Column>Options</Table.Column> : null}
                </Table.Header>
                <Table.Body>
                  {runs.map((run) => (
                    <Table.Row key={run.id} id={run.id}>
                      {canDelete ? (
                        <Table.Cell className="pr-0">
                          <Checkbox
                            aria-label={`Select sync run ${run.id}`}
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
                      ) : null}
                      <Table.Cell>
                        <button
                          type="button"
                          className="text-left font-medium text-foreground hover:text-accent transition-colors"
                          onClick={() => navigate(Routes.admin.syncRuns.detail(run.id))}
                        >
                          {run.crawl_run?.source_agency?.name ?? "—"}
                        </button>
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
                          {run.attempt}
                          {run.max_attempts != null ? `/${run.max_attempts}` : ""}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">
                          {formatDuration(durationMsFromRange(run.started_at, run.finished_at))}
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
        <>
          <ConfirmationDialog
            state={deleteConfirm}
            title="Delete this sync run?"
            description="This will permanently delete the CMS sync run record. This cannot be undone."
            confirmLabel="Delete"
            onConfirm={handleDelete}
            isPending={deleteRun.isPending}
          />
          <ConfirmationDialog
            state={bulkDeleteConfirm}
            title="Delete selected sync runs?"
            description={`This will permanently delete ${selectedCount} sync ${selectedCount === 1 ? "run" : "runs"}. This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={handleBulkDelete}
            isPending={deleteRuns.isPending}
          />
        </>
      ) : null}

      <CmsSyncRunFailuresModal state={failuresModal} run={selectedRun} />
    </div>
  );
}
