import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Table } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { useUserCmsSyncRun } from "@/features/cms-sync-runs/hooks/use-cms-sync-runs";
import {
  CmsSyncStatuses,
  type CmsSyncOperationResult,
  type CmsSyncRunResponse,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";
import { getFailedCmsSyncOperations } from "@/features/cms-sync-runs/utils/parse-cms-sync-failures";
import { getCmsSyncOperationLabel } from "@/config/constants/dropdowns/cms-sync-operation-form.options";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integration-type-form.options";
import { PropertyHistorySummary } from "@/components/ui/property-history-summary";
import { CmsSyncStatusChip } from "./components/cms-sync-status-chip";
import { formatDateTime } from "@/lib/date";
import { durationMsFromRange, formatDuration } from "@/lib/duration";

function connectionLabel(connection?: {
  email: string | null;
  username: string | null;
}) {
  if (!connection) return "—";
  return connection.email || connection.username || "—";
}

function getSyncedProperties(
  response: CmsSyncRunResponse | null | undefined,
): CmsSyncOperationResult[] {
  if (!response?.operation_results || !Array.isArray(response.operation_results)) {
    return [];
  }

  return response.operation_results.filter((op) => op && op.success !== false);
}

function propertyLabel(result: CmsSyncOperationResult) {
  const title = result.property_title?.trim();
  return title || "Untitled property";
}

export default function DashboardSyncRunDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: run, isPending } = useUserCmsSyncRun(id);

  if (isPending || !run) {
    return <DetailSkeleton fieldCount={6} showSubTable subTableRows={4} />;
  }

  const isActive =
    run.status === CmsSyncStatuses.PENDING || run.status === CmsSyncStatuses.RETRYING;
  const agencyName = run.crawl_run?.source_agency?.name ?? "Unknown agency";
  const integrationAccount = connectionLabel(run.user_integration);
  const integrationType = run.user_integration?.integration_target.integration_type
    ? getIntegrationTypeLabel(run.user_integration.integration_target.integration_type)
    : "—";
  const syncedProperties = getSyncedProperties(run.response);
  const failures = getFailedCmsSyncOperations(run.response);

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(Routes.dashboard.syncRuns.list)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sync runs
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-2xl font-semibold tracking-tight text-foreground">{agencyName}</p>
        <CmsSyncStatusChip status={run.status} />
        {isActive ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : null}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Created</span>
          <span className="font-mono text-2xl font-bold text-success">{run.total_created}</span>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Updated</span>
          <span className="font-mono text-2xl font-bold text-foreground">{run.total_updated}</span>
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
          <span className="text-sm text-foreground">{agencyName}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Integration
          </span>
          <span className="text-sm text-foreground">{integrationType}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Account</span>
          <span className="text-sm text-foreground">{integrationAccount}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Duration</span>
          <span className="text-sm text-foreground">
            {formatDuration(durationMsFromRange(run.started_at, run.finished_at))}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Started</span>
          <span className="text-sm text-foreground">{formatDateTime(run.started_at)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Finished</span>
          <span className="text-sm text-foreground">{formatDateTime(run.finished_at)}</span>
        </div>
        {run.error_message ? (
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Error</span>
            <span className="text-sm text-danger whitespace-pre-wrap">{run.error_message}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Synced properties</p>
        {syncedProperties.length === 0 ? (
          <p className="text-sm text-muted">No properties were synced in this run.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Synced properties">
                  <Table.Header>
                    <Table.Column isRowHeader>Property</Table.Column>
                    <Table.Column>Result</Table.Column>
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
                            type="button"
                            className="text-sm text-accent hover:underline text-left"
                            onClick={() =>
                              navigate(
                                Routes.dashboard.properties.detail(result.user_property_id),
                              )
                            }
                          >
                            {propertyLabel(result)}
                          </button>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="text-sm text-foreground">
                            {getCmsSyncOperationLabel(result.operation)}
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
        )}
      </div>

      {run.total_failed > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Failed properties</p>
          {failures.length === 0 ? (
            <p className="text-sm text-muted">No failure details stored for this run.</p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Failed properties">
                    <Table.Header>
                      <Table.Column isRowHeader>Property</Table.Column>
                      <Table.Column>Attempt</Table.Column>
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
                              type="button"
                              className="text-sm text-accent hover:underline text-left"
                              onClick={() =>
                                navigate(
                                  Routes.dashboard.properties.detail(
                                    failure.user_property_id,
                                  ),
                                )
                              }
                            >
                              {propertyLabel(failure)}
                            </button>
                          </Table.Cell>
                          <Table.Cell>
                            <span className="text-sm text-foreground">
                              {getCmsSyncOperationLabel(failure.operation)}
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
    </div>
  );
}
