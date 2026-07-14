import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal, Label, TextArea, EmptyState, useOverlayState } from "@heroui/react";
import { ArrowLeft, Loader2, ImageOff, X } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { GenerationRunStatusChip } from "@/features/scraper-generation/components/generation-run-status-chip";
import { GenerationRunTriggerChip } from "@/features/scraper-generation/components/generation-run-trigger-chip";
import {
  useApproveGenerationRun,
  useCancelGenerationRun,
  useGenerationRun,
  useRejectGenerationRun,
} from "@/features/scraper-generation/hooks/use-scraper-generation";
import {
  GenerationRunStatuses,
  type GenerationRunStatus,
} from "@/features/scraper-generation/interfaces/scraper-generation.interfaces";
import { formatDateTime } from "@/lib/date";

const ACTIVE_STATUSES: GenerationRunStatus[] = [
  GenerationRunStatuses.QUEUED,
  GenerationRunStatuses.RUNNING,
];

export default function GenerationRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rejectModal = useOverlayState();

  const [rejectReason, setRejectReason] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: run, isPending } = useGenerationRun(id!);
  const approveRun = useApproveGenerationRun();
  const rejectRun = useRejectGenerationRun();
  const cancelRun = useCancelGenerationRun();

  if (isPending || !run) {
    return <DetailSkeleton fieldCount={4} showSubTable subTableRows={3} />;
  }

  const isActive = ACTIVE_STATUSES.includes(run.status);
  const steps = run.steps ?? [];

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate(Routes.admin.generationRuns.list)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to generation runs
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {run.source_agency?.name ?? run.source_agency_id}
          </p>
          <GenerationRunTriggerChip trigger={run.trigger} />
          <GenerationRunStatusChip status={run.status} />
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        </div>

        {isActive && (
          <ActionButtonWithPending
            variant="danger"
            isPending={cancelRun.isPending}
            isDisabled={cancelRun.isPending}
            onPress={() => cancelRun.mutate(run.id)}
          >
            Cancel
          </ActionButtonWithPending>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-border bg-surface p-6">
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
            <span className="text-sm text-foreground">New scraper (none yet)</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Created / finished
          </span>
          <span className="text-sm text-foreground">
            {formatDateTime(run.created_at)} / {formatDateTime(run.finished_at)}
          </span>
        </div>
        {run.prompt && (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Prompt</span>
            <span className="text-sm text-foreground">{run.prompt}</span>
          </div>
        )}
      </div>

      {run.status === GenerationRunStatuses.SUCCESS && run.scraper_id && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-foreground">Approved — a new scraper version is now active.</p>
          <ActionButtonWithPending
            variant="secondary"
            onPress={() => navigate(Routes.admin.scrapers.detail(run.scraper_id!))}
          >
            View scraper
          </ActionButtonWithPending>
        </div>
      )}

      {(run.status === GenerationRunStatuses.FAILED ||
        run.status === GenerationRunStatuses.CANCELLED) && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-6">
          <p className="text-sm font-medium text-foreground mb-1">
            {run.status === GenerationRunStatuses.FAILED
              ? "Generation failed"
              : "Generation cancelled"}
          </p>
          {run.error_message && <p className="text-sm text-danger">{run.error_message}</p>}
        </div>
      )}

      {run.status === GenerationRunStatuses.AWAITING_REVIEW && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-6 flex flex-col gap-4">
          <p className="text-sm font-medium text-foreground">Staged config — review before approving</p>
          <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-96">
            {JSON.stringify(run.staged_config, null, 2)}
          </pre>
          <div className="flex justify-end gap-2">
            <ActionButtonWithPending variant="secondary" onPress={rejectModal.open}>
              Reject
            </ActionButtonWithPending>
            <ActionButtonWithPending
              isPending={approveRun.isPending}
              isDisabled={approveRun.isPending}
              onPress={() => approveRun.mutate(run.id)}
            >
              Approve
            </ActionButtonWithPending>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <p className="text-sm font-medium text-foreground">Session replay</p>
          {steps.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {steps.map((step) => (
                <a
                  key={step.id}
                  href={`#step-${step.step_index}`}
                  className="flex h-6 min-w-6 items-center justify-center rounded-md border border-border px-1.5 text-xs text-muted hover:text-foreground hover:border-accent/50"
                >
                  {step.step_index}
                </a>
              ))}
            </div>
          )}
        </div>

        {steps.length === 0 ? (
          <EmptyState>
            <p className="text-sm text-muted">
              {isActive ? "Waiting for the first step..." : "No steps were recorded for this run."}
            </p>
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {steps.map((step) => (
              <div
                key={step.id}
                id={`step-${step.step_index}`}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 scroll-mt-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-xs font-medium text-foreground">
                    {step.step_index}
                  </span>
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                    {step.action_type.replace(/_/g, " ")}
                  </span>
                </div>

                {step.model_reasoning && <p className="text-sm text-muted">{step.model_reasoning}</p>}

                <div className="grid gap-3 sm:grid-cols-2">
                  <ScreenshotThumb
                    label="Before"
                    url={step.screenshot_before_url}
                    onEnlarge={setLightboxUrl}
                  />
                  <ScreenshotThumb
                    label="After"
                    url={step.screenshot_after_url}
                    onEnlarge={setLightboxUrl}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Screenshot"
            className="max-h-full max-w-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <Modal state={rejectModal}>
        <Modal.Backdrop isDismissable={!rejectRun.isPending} />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Reject this run</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="reject-reason">Reason (optional)</Label>
                  <TextArea
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    fullWidth
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <ActionButtonWithPending
                    variant="secondary"
                    isDisabled={rejectRun.isPending}
                    onPress={rejectModal.close}
                  >
                    Cancel
                  </ActionButtonWithPending>
                  <ActionButtonWithPending
                    variant="danger"
                    isPending={rejectRun.isPending}
                    isDisabled={rejectRun.isPending}
                    onPress={() =>
                      rejectRun.mutate(
                        { id: run.id, payload: { reason: rejectReason || undefined } },
                        {
                          onSuccess: () => {
                            rejectModal.close();
                            setRejectReason("");
                          },
                        },
                      )
                    }
                  >
                    Reject
                  </ActionButtonWithPending>
                </div>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  );
}

function ScreenshotThumb({
  label,
  url,
  onEnlarge,
}: {
  label: string;
  url: string | null;
  onEnlarge: (url: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {url ? (
        <button
          onClick={() => onEnlarge(url)}
          className="overflow-hidden rounded-lg border border-border hover:border-accent/50 transition-colors"
        >
          <img src={url} alt={`${label} screenshot`} className="w-full h-auto" />
        </button>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-border bg-background h-24 text-muted">
          <ImageOff className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
