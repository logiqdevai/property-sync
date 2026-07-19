import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  useAdminCmsSyncRun,
  useRetryAdminCmsSyncRun,
} from "@/features/cms-sync-runs/hooks/use-cms-sync-runs";
import {
  CmsSyncStatuses,
  type CmsSyncStatus,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";
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

const RETRYABLE: CmsSyncStatus[] = [CmsSyncStatuses.FAILED, CmsSyncStatuses.RETRYING];

export default function AdminSyncRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: run, isPending } = useAdminCmsSyncRun(id!);
  const retry = useRetryAdminCmsSyncRun();

  if (isPending || !run) {
    return <DetailSkeleton fieldCount={8} showSubTable subTableRows={2} />;
  }

  const isActive =
    run.status === CmsSyncStatuses.PENDING || run.status === CmsSyncStatuses.RETRYING;
  const canRetry =
    RETRYABLE.includes(run.status) &&
    (run.max_attempts == null || run.attempt < run.max_attempts);
  const agencyId = run.crawl_run?.source_agency_id ?? run.crawl_run?.source_agency?.id;
  const userId = run.user_integration?.user_id ?? run.user_integration?.user?.id;
  const integrationTargetId = run.user_integration?.integration_target?.id;

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
        {canRetry && (
          <ActionButtonWithPending
            isPending={retry.isPending}
            isDisabled={retry.isPending}
            onPress={() => retry.mutate(run.id)}
          >
            Retry
          </ActionButtonWithPending>
        )}
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
          <button
            className="text-sm text-accent hover:underline text-left font-mono"
            onClick={() => navigate(Routes.admin.crawlRuns.detail(run.crawl_run_id))}
          >
            {run.crawl_run_id}
          </button>
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
