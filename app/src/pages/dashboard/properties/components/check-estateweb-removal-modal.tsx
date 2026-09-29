import { useEffect, useState, type FC } from "react";
import { Link } from "react-router-dom";
import { Button, Modal, ProgressBar, useOverlayState } from "@heroui/react";
import type { UseMutationResult } from "@tanstack/react-query";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { useJob } from "@/features/jobs/hooks/use-jobs";
import { Routes } from "@/routes/routes";
import type {
  CheckEstateWebRemovalJobResult,
  CheckEstateWebRemovalPayload,
  CheckEstateWebRemovalResult,
} from "@/features/user-properties/interfaces/user-properties.interfaces";

export type CheckEstateWebRemovalModalState = ReturnType<typeof useOverlayState>;

const ACTIVE_JOB_STATUSES = new Set(["WAITING", "ACTIVE", "DELAYED", "PAUSED"]);

type CheckEstateWebRemovalModalProps = {
  state: CheckEstateWebRemovalModalState;
  propertyIds: string[];
  check: UseMutationResult<
    CheckEstateWebRemovalResult,
    Error,
    CheckEstateWebRemovalPayload
  >;
  onFix: (ids: string[]) => void | Promise<void>;
  isFixPending?: boolean;
};

export const CheckEstateWebRemovalModal: FC<CheckEstateWebRemovalModalProps> = ({
  state,
  propertyIds,
  check,
  onFix,
  isFixPending = false,
}) => {
  const [jobLogId, setJobLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setJobLogId(null);
      check.reset();
    }
  }, [state.isOpen]);

  const { data: job } = useJob(jobLogId ?? "");
  const result = job?.result as CheckEstateWebRemovalJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);
  const progressTotal = result?.total || propertyIds.length || 1;
  const progressColor = !result
    ? "accent"
    : !jobIsActive && result.failed > 0
      ? "warning"
      : !jobIsActive
        ? "success"
        : "accent";

  const stillLiveIds = !jobIsActive ? (result?.still_live_ids ?? []) : [];
  const copyValue = stillLiveIds.join(", ");

  const handleStart = () => {
    check.mutate(
      { ids: propertyIds },
      { onSuccess: (started) => setJobLogId(started.job_log_id) },
    );
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!jobIsActive && !isFixPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-lg w-full">
            <Modal.Header>
              <Modal.Heading>Check EstateWeb removal sync</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              {!jobLogId ? (
                <p className="text-sm text-foreground">
                  {propertyIds.length === 0 ? (
                    "Select one or more properties in the table first."
                  ) : (
                    <>
                      Checks{" "}
                      <span className="font-semibold">{propertyIds.length}</span>{" "}
                      selected {propertyIds.length === 1 ? "property" : "properties"}{" "}
                      (REMOVED/SOLD and linked to EstateWeb) against EstateWeb's live
                      state to find which ones are still published on at least one
                      site. Runs in the background — progress shows here and in Job
                      queue.
                    </>
                  )}
                </p>
              ) : (
                <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {jobIsActive ? "Checking in the background…" : "Finished"}
                    </span>
                    <Link
                      to={Routes.admin.jobs.detail(jobLogId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-accent hover:underline"
                    >
                      View in Job queue
                    </Link>
                  </div>

                  <ProgressBar.Root
                    value={result?.processed ?? 0}
                    minValue={0}
                    maxValue={progressTotal}
                    isIndeterminate={!result}
                    color={progressColor}
                    size="md"
                  >
                    <ProgressBar.Track className="relative overflow-hidden">
                      <ProgressBar.Fill className="transition-[width] duration-700 ease-out" />
                    </ProgressBar.Track>
                  </ProgressBar.Root>

                  {result ? (
                    <p className="text-sm text-muted">
                      {result.processed} of {result.total} checked —{" "}
                      <span className="font-medium text-foreground">
                        {result.still_live} still live
                      </span>
                      , {result.unpublished} already unpublished,{" "}
                      {result.failed} failed.
                    </p>
                  ) : (
                    <p className="text-sm text-muted">Starting…</p>
                  )}
                </div>
              )}

              {!jobIsActive && jobLogId && result ? (
                result.still_live > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted uppercase">
                        User property IDs still live
                      </span>
                      <CopyIconButton
                        value={copyValue}
                        ariaLabel="Copy still-live user property IDs"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-secondary px-3 py-2">
                      <code className="text-xs whitespace-pre-wrap break-all">
                        {copyValue}
                      </code>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Nothing to fix — every checked property is already correctly
                    unpublished on EstateWeb.
                  </p>
                )
              ) : null}
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onPress={() => state.close()}
                isDisabled={jobIsActive || isFixPending}
              >
                Close
              </Button>
              {!jobLogId ? (
                <ActionButtonWithPending
                  type="button"
                  variant="primary"
                  onPress={handleStart}
                  isPending={check.isPending}
                  isDisabled={propertyIds.length === 0}
                >
                  Start check
                </ActionButtonWithPending>
              ) : (
                <ActionButtonWithPending
                  type="button"
                  variant="primary"
                  isPending={isFixPending}
                  isDisabled={jobIsActive || stillLiveIds.length === 0}
                  onPress={() => onFix(stillLiveIds)}
                >
                  Unlink from sites ({stillLiveIds.length})
                </ActionButtonWithPending>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
