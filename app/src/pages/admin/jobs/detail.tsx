import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useOverlayState } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { JobStatusChip } from "./components/job-status-chip";
import { useDeleteJob, useJob, useRetryJob, useStopJob } from "@/features/jobs/hooks/use-jobs";
import { JobStatuses } from "@/features/jobs/interfaces/jobs.interfaces";
import { formatDateTime } from "@/lib/date";
import { formatDuration } from "@/lib/duration";

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

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const stopConfirm = useOverlayState();
  const deleteConfirm = useOverlayState();

  const { data: job, isPending } = useJob(id!);
  const retryJob = useRetryJob();
  const stopJob = useStopJob();
  const deleteJob = useDeleteJob();

  if (isPending || !job) {
    return <DetailSkeleton fieldCount={5} showSubTable subTableRows={2} />;
  }

  const isActive =
    job.status === JobStatuses.WAITING ||
    job.status === JobStatuses.ACTIVE ||
    job.status === JobStatuses.DELAYED ||
    job.status === JobStatuses.PAUSED;

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate(Routes.admin.jobs.list)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to job queue
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {job.job_name ?? job.queue_name}
          </p>
          <JobStatusChip status={job.status} />
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <ActionButtonWithPending
              variant="danger"
              isPending={stopJob.isPending}
              isDisabled={stopJob.isPending}
              onPress={stopConfirm.open}
            >
              Stop
            </ActionButtonWithPending>
          ) : job.status === JobStatuses.FAILED ? (
            <ActionButtonWithPending
              isPending={retryJob.isPending}
              isDisabled={retryJob.isPending}
              onPress={() => retryJob.mutate(job.id)}
            >
              Retry
            </ActionButtonWithPending>
          ) : null}
          <ActionButtonWithPending
            variant="danger"
            isPending={deleteJob.isPending}
            isDisabled={deleteJob.isPending}
            onPress={deleteConfirm.open}
          >
            Delete
          </ActionButtonWithPending>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Queue</span>
          <span className="text-sm text-foreground">{job.queue_name}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Job ID</span>
          <span className="text-sm text-foreground font-mono text-xs break-all">
            {job.job_id ?? "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Attempts</span>
          <span className="text-sm text-foreground">
            {job.attempt}
            {job.max_attempts !== null ? ` / ${job.max_attempts}` : ""}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Duration</span>
          <span className="text-sm text-foreground">{formatDuration(job.duration_ms)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Started / finished
          </span>
          <span className="text-sm text-foreground">
            {formatDateTime(job.started_at)} / {formatDateTime(job.finished_at)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Crawl run</span>
          {job.crawl_run_id ? (
            <button
              className="text-sm text-accent hover:underline text-left"
              onClick={() => navigate(Routes.admin.crawlRuns.detail(job.crawl_run_id!))}
            >
              View crawl run
            </button>
          ) : (
            <span className="text-sm text-foreground">—</span>
          )}
        </div>
        {job.error_message && (
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Error</span>
            <span className="text-sm text-danger">{job.error_message}</span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Payload</p>
        <JsonBlock value={job.payload} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Result</p>
        <JsonBlock value={job.result} />
      </div>

      {job.stack_trace && (
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Stack trace</p>
          <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
            {job.stack_trace}
          </pre>
        </div>
      )}

      <ConfirmationDialog
        state={stopConfirm}
        title="Stop this job?"
        description="The job will be removed from the queue if possible and marked as failed. An already-running worker may still finish its current work."
        confirmLabel="Stop job"
        isPending={stopJob.isPending}
        onConfirm={async () => {
          await stopJob.mutateAsync(job.id);
        }}
      />

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete this job?"
        description="This will permanently delete the job log. This cannot be undone."
        confirmLabel="Delete"
        isPending={deleteJob.isPending}
        onConfirm={async () => {
          await deleteJob.mutateAsync(job.id);
          navigate(Routes.admin.jobs.list);
        }}
      />
    </div>
  );
}
