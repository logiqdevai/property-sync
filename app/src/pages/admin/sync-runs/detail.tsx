import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Table } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { DetailErrorState } from "@/components/ui/detail-error-state";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  useAdminCmsSyncRun,
  useRerunAdminCmsSyncRun,
  useRetryAdminCmsSyncRun,
} from "@/features/cms-sync-runs/hooks/use-cms-sync-runs";
import {
  CmsSyncStatuses,
  type CmsSyncOperationResult,
  type CmsSyncStatus,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";
import {
  getFailedCmsSyncOperations,
  getSyncedCmsSyncOperations,
} from "@/features/cms-sync-runs/utils/parse-cms-sync-failures";
import { getCmsSyncOperationLabel } from "@/config/constants/dropdowns/integrations/cms-sync-operation-form.options";
import { PropertyHistorySummary } from "@/components/ui/property-history-summary";
import { CmsSyncStatusChip } from "./components/cms-sync-status-chip";
import { formatDateTime } from "@/lib/date";
import { durationMsFromRange, formatDuration } from "@/lib/duration";

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-muted">—</span>;
  }

  return (
    <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-96">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function connectionLabel(connection?: {
  email: string | null;
  username: string | null;
}) {
  if (!connection) return "—";
  return connection.email || connection.username || "—";
}

function propertyLabel(result: CmsSyncOperationResult) {
  const title = result.property_title?.trim();
  return title || result.user_property_id;
}

const RETRYABLE: CmsSyncStatus[] = [CmsSyncStatuses.FAILED, CmsSyncStatuses.RETRYING];

export default function AdminSyncRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: run, isPending, isError, error } = useAdminCmsSyncRun(id!);
  const retry = useRetryAdminCmsSyncRun();
  const rerun = useRerunAdminCmsSyncRun();

  if (isPending) {
    return <DetailSkeleton fieldCount={8} showSubTable subTableRows={2} />;
  }

  if (isError || !run) {
    return (
      <DetailErrorState
        title="Sync run not found"
        description={
          error instanceof Error
            ? error.message
            : "This sync run could not be found."
        }
        backHref={Routes.admin.syncRuns.list}
        backLabel="← Back to sync runs"
      />
    );
  }

  const isActive =
    run.status === CmsSyncStatuses.PENDING || run.status === CmsSyncStatuses.RETRYING;
  const canRetry =
    RETRYABLE.includes(run.status) &&
    (run.max_attempts == null || run.attempt < run.max_attempts);
  const canRerun = !isActive;
  const agencyId = run.crawl_run?.source_agency_id ?? run.crawl_run?.source_agency?.id;
  const userId = run.user_integration?.user_id ?? run.user_integration?.user?.id;
  const integrationTargetId = run.user_integration?.integration_target?.id;
  const failures = getFailedCmsSyncOperations(run.response);
  const syncedProperties = getSyncedCmsSyncOperations(run.response);

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate(Routes.admin.syncRuns.list)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sync runs
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {run.crawl_run?.source_agency?.name ?? "Sync run"}
          </p>
          <CmsSyncStatusChip status={run.status} />
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canRerun ? (
            <ActionButtonWithPending
              variant="secondary"
              isPending={rerun.isPending}
              isDisabled={rerun.isPending || retry.isPending}
              onPress={() => rerun.mutate(run.id)}
            >
              Rerun
            </ActionButtonWithPending>
          ) : null}
          {canRetry ? (
            <ActionButtonWithPending
              isPending={retry.isPending}
              isDisabled={retry.isPending || rerun.isPending}
              onPress={() => retry.mutate(run.id)}
            >
              Retry
            </ActionButtonWithPending>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Created</span>
          <span className="font-mono text-2xl font-bold text-success">{run.total_created}</span>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Updated</span>
          <span className="font-mono text-2xl font-bold text-foreground">{run.total_updated}</span>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Linked</span>
          <span className="font-mono text-2xl font-bold text-foreground">{run.total_linked}</span>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Removed</span>
          <span
            className={`font-mono text-2xl font-bold ${run.total_removed > 0 ? "text-warning" : "text-foreground"}`}
          >
            {run.total_removed}
          </span>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Failed</span>
          <span
            className={`font-mono text-2xl font-bold ${run.total_failed > 0 ? "text-danger" : "text-foreground"}`}
          >
            {run.total_failed}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Agency</span>
          {agencyId ? (
            <button
              className="text-sm text-accent hover:underline text-left"
              onClick={() => navigate(Routes.admin.agencies.detail(agencyId))}
            >
              {run.crawl_run?.source_agency?.name ?? agencyId}
            </button>
          ) : (
            <span className="text-sm text-foreground">—</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">User</span>
          {userId ? (
            <button
              className="text-sm text-accent hover:underline text-left"
              onClick={() => navigate(Routes.admin.users.detail(userId))}
            >
              {run.user_integration?.user?.email ?? userId}
            </button>
          ) : (
            <span className="text-sm text-foreground">—</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Integration
          </span>
          <span className="text-sm text-foreground">{connectionLabel(run.user_integration)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Integration type
          </span>
          {integrationTargetId ? (
            <button
              className="text-sm text-accent hover:underline text-left"
              onClick={() =>
                navigate(Routes.admin.integrationTargets.detail(integrationTargetId))
              }
            >
              {run.user_integration?.integration_target.integration_type ?? "—"}
            </button>
          ) : (
            <span className="text-sm text-foreground">
              {run.user_integration?.integration_target.integration_type ?? "—"}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Base URL</span>
          <span className="text-sm text-foreground break-all">
            {run.user_integration?.integration_target.base_url ?? "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Crawl run</span>
          {run.crawl_run_id ? (
            <button
              className="text-sm text-accent hover:underline text-left font-mono"
              onClick={() => navigate(Routes.admin.crawlRuns.detail(run.crawl_run_id!))}
            >
              {run.crawl_run_id}
            </button>
          ) : (
            <span className="text-sm text-foreground">— (backfill/manual push)</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Attempt</span>
          <span className="text-sm text-foreground font-mono">
            {run.attempt}
            {run.max_attempts != null ? ` / ${run.max_attempts}` : ""}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Duration</span>
          <span className="text-sm text-foreground font-mono">
            {formatDuration(durationMsFromRange(run.started_at, run.finished_at))}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Started / finished
          </span>
          <span className="text-sm text-foreground">
            {formatDateTime(run.started_at)} / {formatDateTime(run.finished_at)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Created / updated
          </span>
          <span className="text-sm text-foreground">
            {formatDateTime(run.created_at)} / {formatDateTime(run.updated_at)}
          </span>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Run ID</span>
          <span className="text-sm text-foreground font-mono break-all">{run.id}</span>
        </div>
        {run.error_message && (
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Error</span>
            <span className="text-sm text-danger whitespace-pre-wrap">{run.error_message}</span>
          </div>
        )}
      </div>

      {syncedProperties.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">User properties</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="User properties">
                  <Table.Header>
                    <Table.Column isRowHeader>Property</Table.Column>
                    <Table.Column>Operation</Table.Column>
                    <Table.Column>History</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {syncedProperties.map((result) => (
                      <Table.Row
                        key={`${result.user_property_id}-${result.operation}`}
                        id={`${result.user_property_id}-${result.operation}`}
                      >
                        <Table.Cell>
                          <button
                            className="flex flex-col items-start gap-0.5 text-left"
                            onClick={() =>
                              navigate(
                                Routes.admin.properties.userDetail(
                                  result.user_property_id,
                                ),
                              )
                            }
                          >
                            <span className="text-sm text-accent hover:underline">
                              {propertyLabel(result)}
                            </span>
                            {result.property_title?.trim() ? (
                              <span className="text-xs font-mono text-muted break-all">
                                {result.user_property_id}
                              </span>
                            ) : null}
                          </button>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="font-mono text-sm text-foreground">
                            {getCmsSyncOperationLabel(result.operation, {
                              skipped_push: result.skipped_push,
                            })}
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          <PropertyHistorySummary history={result.history} />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        </div>
      ) : null}

      {run.total_failed > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Failed properties</p>
          {failures.length === 0 ? (
            <p className="text-sm text-muted">No failure details stored for this run.</p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Failed property insertions">
                    <Table.Header>
                      <Table.Column isRowHeader>Title</Table.Column>
                      <Table.Column>Operation</Table.Column>
                      <Table.Column>Reason</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {failures.map((failure) => (
                        <Table.Row
                          key={`${failure.user_property_id}-${failure.operation}`}
                          id={`${failure.user_property_id}-${failure.operation}`}
                        >
                          <Table.Cell>
                            <button
                              className="text-sm text-accent hover:underline text-left"
                              onClick={() =>
                                navigate(
                                  Routes.admin.properties.userDetail(
                                    failure.user_property_id,
                                  ),
                                )
                              }
                            >
                              {failure.property_title || failure.user_property_id}
                            </button>
                          </Table.Cell>
                          <Table.Cell>
                            <span className="font-mono text-sm text-foreground">
                              {failure.operation}
                            </span>
                          </Table.Cell>
                          <Table.Cell>
                            <span className="text-sm text-danger whitespace-pre-wrap break-words">
                              {failure.error ?? "Unknown error"}
                            </span>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Payload</p>
        <JsonBlock value={run.payload} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Response</p>
        <JsonBlock value={run.response} />
      </div>
    </div>
  );
}
