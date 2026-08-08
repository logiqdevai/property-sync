import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Accordion, Table, useOverlayState } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { DetailErrorState } from "@/components/ui/detail-error-state";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PropertyHistorySummary } from "@/components/ui/property-history-summary";
import { CrawlRunStatusChip } from "./components/crawl-run-status-chip";
import {
  useCancelCrawlRun,
  useCrawlRun,
  useDeleteCrawlRun,
  useRerunCrawlRun,
} from "@/features/crawl-runs/hooks/use-crawl-runs";
import {
  CrawlRunStatuses,
  type CrawlRunDetail,
  type CrawlRunStatus,
} from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";
import { getCmsSyncOperationLabel } from "@/config/constants/dropdowns/integrations/cms-sync-operation-form.options";
import type { PropertyHistoryEntry } from "@/features/properties/interfaces/properties.interfaces";
import { JobStatusChip } from "./components/job-status-chip";
import type { JobStatus } from "@/features/jobs/interfaces/jobs.interfaces";
import {
  formatPropertyHistoryLabel,
  formatPropertyHistoryValue,
} from "@/features/properties/utils/format-property-history";
import { formatDateTime } from "@/lib/date";
import { formatDuration } from "@/lib/duration";

const ACTIVE_STATUSES: CrawlRunStatus[] = [
  CrawlRunStatuses.QUEUED,
  CrawlRunStatuses.RUNNING,
];

function formatUsd(value: string | null) {
  if (!value) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toFixed(6)}`;
}

function getCrawlUserProperties(run: CrawlRunDetail) {
  const rows: Array<{
    key: string;
    sync_run_id: string;
    user_property_id: string;
    property_title: string;
    operation: string;
    skipped_push?: boolean;
    user_email: string | null;
    history?: PropertyHistoryEntry[];
  }> = [];

  for (const syncRun of run.cms_sync_runs ?? []) {
    const results = syncRun.response?.operation_results ?? [];
    for (const result of results) {
      if (!result || result.success === false) continue;
      rows.push({
        key: `${syncRun.id}-${result.user_property_id}-${result.operation}`,
        sync_run_id: syncRun.id,
        user_property_id: result.user_property_id,
        property_title: result.property_title?.trim() || result.user_property_id,
        operation: result.operation,
        skipped_push: result.skipped_push,
        user_email: syncRun.user_integration?.user?.email ?? null,
        history: result.history,
      });
    }
  }

  return rows;
}

export default function CrawlRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const stopConfirm = useOverlayState();
  const deleteConfirm = useOverlayState();

  const { data: run, isPending, isError, error } = useCrawlRun(id!);
  const rerun = useRerunCrawlRun();
  const cancelRun = useCancelCrawlRun();
  const deleteRun = useDeleteCrawlRun();

  if (isPending) {
    return <DetailSkeleton fieldCount={6} showSubTable subTableRows={3} />;
  }

  if (isError || !run) {
    return (
      <DetailErrorState
        title="Crawl run not found"
        description={
          error instanceof Error
            ? error.message
            : "This crawl run could not be found."
        }
        backHref={Routes.admin.crawlRuns.list}
        backLabel="← Back to crawl runs"
      />
    );
  }

  const isActive = ACTIVE_STATUSES.includes(run.status);
  const traces = run.execution_traces ?? [];
  const jobLogs = run.job_logs ?? [];
  const userProperties = getCrawlUserProperties(run);
  const propertyHistory = run.property_history ?? [];
  const hasAiCost = run.ai_total_cost !== null;
  const metadata = run.metadata ?? {};
  const batchChunks = Array.isArray(metadata.batch_chunks)
    ? (metadata.batch_chunks as string[][])
    : null;
  const aiBatchId = typeof metadata.ai_batch_id === "string" ? metadata.ai_batch_id : null;
  const aiBatchStatus =
    typeof metadata.ai_batch_status === "string" ? metadata.ai_batch_status : null;

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate(Routes.admin.crawlRuns.list)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to crawl runs
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {run.source_agency?.name ?? run.source_agency_id}
          </p>
          <CrawlRunStatusChip status={run.status} />
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isActive ? (
            <ActionButtonWithPending
              variant="danger"
              isPending={cancelRun.isPending}
              isDisabled={cancelRun.isPending}
              onPress={stopConfirm.open}
            >
              Stop
            </ActionButtonWithPending>
          ) : (
            <ActionButtonWithPending
              variant="secondary"
              isPending={rerun.isPending}
              isDisabled={rerun.isPending}
              onPress={() =>
                rerun.mutate(run.id, {
                  onSuccess: (newRun) => navigate(Routes.admin.crawlRuns.detail(newRun.id)),
                })
              }
            >
              Rerun
            </ActionButtonWithPending>
          )}
          <ActionButtonWithPending
            variant="danger"
            isPending={deleteRun.isPending}
            isDisabled={deleteRun.isPending}
            onPress={deleteConfirm.open}
          >
            Delete
          </ActionButtonWithPending>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Scrape</span>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Found</span>
            <span className="font-mono text-2xl font-bold text-foreground">{run.total_found}</span>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">New</span>
            <span className="font-mono text-2xl font-bold text-success">{run.total_new_listings}</span>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Refreshed</span>
            <span className="font-mono text-2xl font-bold text-foreground">{run.total_refreshed_listings}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">CRM sync (all users)</span>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Scraper</span>
          {run.scraper_id ? (
            <button
              className="text-sm text-accent hover:underline text-left"
              onClick={() => navigate(Routes.admin.scrapers.detail(run.scraper_id!))}
            >
              {run.scraper?.name ?? run.scraper_id}
            </button>
          ) : (
            <span className="text-sm text-foreground">—</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Agency</span>
          <button
            className="text-sm text-accent hover:underline text-left"
            onClick={() => navigate(Routes.admin.agencies.detail(run.source_agency_id))}
          >
            {run.source_agency?.name ?? run.source_agency_id}
          </button>
        </div>
        {run.user_tracked_agency?.user?.email && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Tracked by
            </span>
            <span className="text-sm text-foreground">{run.user_tracked_agency.user.email}</span>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Started / finished
          </span>
          <span className="text-sm text-foreground">
            {formatDateTime(run.started_at)} / {formatDateTime(run.finished_at)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Duration</span>
          <span className="text-sm text-foreground">{formatDuration(run.duration_ms)}</span>
        </div>
        {run.error_message && (
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Error</span>
            <span className="text-sm text-danger">{run.error_message}</span>
          </div>
        )}
      </div>

      {hasAiCost && (
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">AI normalization cost</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <span className="text-muted">Model</span>
              <p className="text-foreground">{run.ai_model ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted">Input cost</span>
              <p className="text-foreground">{formatUsd(run.ai_input_cost)}</p>
            </div>
            <div>
              <span className="text-muted">Output cost</span>
              <p className="text-foreground">{formatUsd(run.ai_output_cost)}</p>
            </div>
            <div>
              <span className="text-muted">Total cost</span>
              <p className="text-foreground font-medium">{formatUsd(run.ai_total_cost)}</p>
            </div>
            <div>
              <span className="text-muted">Avg per property</span>
              <p className="text-foreground">{formatUsd(run.ai_average_cost_per_property)}</p>
            </div>
          </div>
        </div>
      )}

      {batchChunks ? (
        <div className="rounded-xl border border-border bg-surface px-6">
          <Accordion defaultExpandedKeys={[]} hideSeparator>
            <Accordion.Item id="ai-batch-chunks">
              <Accordion.Heading>
                <Accordion.Trigger className="text-sm font-medium text-foreground">
                  AI batch chunks ({batchChunks.length})
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <div className="flex flex-col gap-3 pb-4">
                    <div className="grid gap-3 sm:grid-cols-3 text-sm">
                      <div>
                        <span className="text-muted">Batch ID</span>
                        <p className="text-foreground font-mono text-xs">{aiBatchId ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted">Status</span>
                        <p className="text-foreground">{aiBatchStatus ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted">Chunks / listings</span>
                        <p className="text-foreground">
                          {batchChunks.length} /{" "}
                          {batchChunks.reduce((sum, chunk) => sum + chunk.length, 0)}
                        </p>
                      </div>
                    </div>
                    <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-96">
                      {batchChunks
                        .map((ids, index) => `chunk-${index} (${ids.length}): ${ids.join(", ")}`)
                        .join("\n")}
                    </pre>
                  </div>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </div>
      ) : null}

      {userProperties.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6">
          <Accordion defaultExpandedKeys={[]} hideSeparator>
            <Accordion.Item id="user-properties">
              <Accordion.Heading>
                <Accordion.Trigger className="text-sm font-medium text-foreground">
                  User properties ({userProperties.length})
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <div className="rounded-xl border border-border overflow-hidden mb-4">
                    <Table>
                      <Table.ScrollContainer>
                        <Table.Content aria-label="User properties">
                          <Table.Header>
                            <Table.Column isRowHeader>Property</Table.Column>
                            <Table.Column>User</Table.Column>
                            <Table.Column>Operation</Table.Column>
                            <Table.Column>History</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {userProperties.map((row) => (
                              <Table.Row key={row.key} id={row.key}>
                                <Table.Cell>
                                  <button
                                    className="text-sm text-accent hover:underline text-left"
                                    onClick={() =>
                                      navigate(
                                        Routes.admin.properties.userDetail(row.user_property_id),
                                      )
                                    }
                                  >
                                    {row.property_title}
                                  </button>
                                </Table.Cell>
                                <Table.Cell>
                                  <span className="text-sm text-foreground">
                                    {row.user_email ?? "—"}
                                  </span>
                                </Table.Cell>
                                <Table.Cell>
                                  <span className="font-mono text-sm text-foreground">
                                    {getCmsSyncOperationLabel(row.operation, {
                                      skipped_push: row.skipped_push,
                                    })}
                                  </span>
                                </Table.Cell>
                                <Table.Cell>
                                  <PropertyHistorySummary history={row.history} />
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </div>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </div>
      ) : null}

      {propertyHistory.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6">
          <Accordion defaultExpandedKeys={[]} hideSeparator>
            <Accordion.Item id="property-history">
              <Accordion.Heading>
                <Accordion.Trigger className="text-sm font-medium text-foreground">
                  Property history ({propertyHistory.length})
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <div className="rounded-xl border border-border overflow-hidden mb-4">
                    <Table>
                      <Table.ScrollContainer>
                        <Table.Content aria-label="Property history">
                          <Table.Header>
                            <Table.Column isRowHeader>Property</Table.Column>
                            <Table.Column>Change</Table.Column>
                            <Table.Column>When</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {propertyHistory.map((entry) => (
                              <Table.Row key={entry.id} id={entry.id}>
                                <Table.Cell>
                                  <button
                                    className="text-sm text-accent hover:underline text-left"
                                    onClick={() =>
                                      navigate(Routes.admin.properties.detail(entry.property_id))
                                    }
                                  >
                                    {entry.property?.title ?? entry.property_id}
                                  </button>
                                </Table.Cell>
                                <Table.Cell>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-sm text-foreground">
                                      {formatPropertyHistoryLabel(entry)}
                                    </span>
                                    {entry.field ? (
                                      <span className="text-xs text-muted break-words">
                                        {entry.field}: {formatPropertyHistoryValue(entry.old_value)}{" "}
                                        → {formatPropertyHistoryValue(entry.new_value)}
                                      </span>
                                    ) : entry.old_value != null || entry.new_value != null ? (
                                      <span className="text-xs text-muted break-words">
                                        {formatPropertyHistoryValue(entry.old_value)} →{" "}
                                        {formatPropertyHistoryValue(entry.new_value)}
                                      </span>
                                    ) : null}
                                  </div>
                                </Table.Cell>
                                <Table.Cell>
                                  <span className="text-xs text-muted whitespace-nowrap">
                                    {formatDateTime(entry.created_at)}
                                  </span>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </div>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface px-6">
        <Accordion defaultExpandedKeys={[]} hideSeparator>
          <Accordion.Item id="execution-traces">
            <Accordion.Heading>
              <Accordion.Trigger className="text-sm font-medium text-foreground">
                Execution traces ({traces.length})
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>
                <div className="flex flex-col gap-4 pb-4">
                  {run.diagnostics_package ? (
                    <button
                      className="text-sm text-accent hover:underline self-start"
                      onClick={() =>
                        navigate(Routes.admin.diagnostics.detail(run.diagnostics_package!.id))
                      }
                    >
                      View diagnostics
                    </button>
                  ) : null}
                  {traces.length === 0 ? (
                    <p className="text-sm text-muted">No execution traces recorded.</p>
                  ) : (
                    traces.map((trace) => (
                      <div key={trace.id} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className={trace.success ? "text-success" : "text-danger"}>
                            {trace.success ? "Success" : "Failed"}
                          </span>
                          <span className="text-muted">{formatDateTime(trace.created_at)}</span>
                          {trace.error_summary ? (
                            <span className="text-danger text-xs">{trace.error_summary}</span>
                          ) : null}
                        </div>
                        <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-96">
                          {JSON.stringify(trace.steps, null, 2)}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </div>

      <div className="rounded-xl border border-border bg-surface px-6">
        <Accordion defaultExpandedKeys={[]} hideSeparator>
          <Accordion.Item id="linked-jobs">
            <Accordion.Heading>
              <Accordion.Trigger className="text-sm font-medium text-foreground">
                Linked jobs ({jobLogs.length})
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>
                <div className="pb-4">
                  {jobLogs.length === 0 ? (
                    <p className="text-sm text-muted">No linked job logs.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {jobLogs.map((job) => (
                        <button
                          key={job.id}
                          onClick={() => navigate(Routes.admin.jobs.detail(job.id))}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:border-accent/50 transition-colors"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-foreground">
                              {job.job_name ?? job.queue_name}
                            </span>
                            <span className="text-xs text-muted">
                              attempt {job.attempt}
                              {job.max_attempts !== null ? ` / ${job.max_attempts}` : ""}
                              {job.duration_ms !== null
                                ? ` · ${formatDuration(job.duration_ms)}`
                                : ""}
                            </span>
                          </div>
                          <JobStatusChip status={job.status as JobStatus} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </div>

      <ConfirmationDialog
        state={stopConfirm}
        title="Stop this crawl run?"
        description="The run will be marked cancelled and removed from the queue if possible. An already-running worker may still finish its current scrape work."
        confirmLabel="Stop crawl"
        isPending={cancelRun.isPending}
        onConfirm={async () => {
          await cancelRun.mutateAsync(run.id);
        }}
      />

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete this crawl run?"
        description="This will permanently delete the crawl run and its execution traces. This cannot be undone."
        confirmLabel="Delete"
        isPending={deleteRun.isPending}
        onConfirm={async () => {
          await deleteRun.mutateAsync(run.id);
          navigate(Routes.admin.crawlRuns.list);
        }}
      />
    </div>
  );
}
