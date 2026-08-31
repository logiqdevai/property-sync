import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Modal, useOverlayState } from "@heroui/react";
import type { UseMutationResult } from "@tanstack/react-query";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useJob } from "@/features/jobs/hooks/use-jobs";
import { Routes } from "@/routes/routes";

export type ResolveEstateWebLocationsModalState = ReturnType<typeof useOverlayState>;

interface ResolveEstateWebLocationsResult {
  job_log_id: string;
  enqueued: number;
  message: string;
}

interface ResolveEstateWebLocationFailure {
  entity_id: string;
  title: string | null;
  error: string;
}

interface ResolveEstateWebLocationJobResult {
  total: number;
  processed: number;
  resolved: number;
  unchanged: number;
  skipped: number;
  failed: number;
  failures?: ResolveEstateWebLocationFailure[];
}

const ACTIVE_JOB_STATUSES = new Set(["WAITING", "ACTIVE", "DELAYED", "PAUSED"]);

export function ResolveEstateWebLocationsModal({
  state,
  resolve,
  getDetailRoute,
  propertyIds,
}: {
  state: ResolveEstateWebLocationsModalState;
  resolve: UseMutationResult<ResolveEstateWebLocationsResult, Error, string[]>;
  /** Builds the link target for a failed entity's own detail page (differs between the
   * admin canonical-Property list and the per-user saved-properties dashboard). */
  getDetailRoute: (entityId: string) => string;
  /** The currently table-selected property/user-property ids -- this only ever acts on
   * the selection, never on every row, so an empty selection has nothing to run. */
  propertyIds: string[];
}) {
  const [jobLogId, setJobLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setJobLogId(null);
    }
  }, [state.isOpen]);

  const { data: job } = useJob(jobLogId ?? "");
  const result = job?.result as ResolveEstateWebLocationJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);

  const handleStart = () => {
    resolve.mutate(propertyIds, {
      onSuccess: (started) => setJobLogId(started.job_log_id),
    });
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!jobIsActive}>
        <Modal.Container>
          <Modal.Dialog className="max-w-lg w-full">
            <Modal.Header>
              <Modal.Heading>Resolve EstateWeb locations</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                {!jobLogId ? (
                  <p className="text-sm text-foreground">
                    {propertyIds.length === 0 ? (
                      "Select one or more properties in the table first."
                    ) : (
                      <>
                        Re-check{" "}
                        <span className="font-semibold">{propertyIds.length}</span>{" "}
                        selected {propertyIds.length === 1 ? "property's" : "properties'"}{" "}
                        EstateWeb location against Google&apos;s structured address
                        (municipality-scoped) and correct any mismatched location id. Runs
                        in the background — progress shows here and in Job queue.
                      </>
                    )}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {jobIsActive ? "Running in the background…" : "Finished"}
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
                    {result ? (
                      <p className="text-sm text-muted">
                        {result.processed} of {result.total} checked —{" "}
                        <span className="font-medium text-foreground">
                          {result.resolved} changed
                        </span>
                        , {result.unchanged} already correct, {result.skipped} skipped
                        (no address match), {result.failed} failed.
                      </p>
                    ) : (
                      <p className="text-sm text-muted">Starting…</p>
                    )}
                  </div>
                )}

                {!jobIsActive && result?.failures?.length ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Failed properties
                    </span>
                    <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl border border-border p-2">
                      {result.failures.map((failure) => (
                        <div
                          key={failure.entity_id}
                          className="flex flex-col gap-0.5 rounded-lg border border-border/60 p-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              to={getDetailRoute(failure.entity_id)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-accent hover:underline"
                            >
                              {failure.title || failure.entity_id}
                            </Link>
                            <span className="shrink-0 text-xs text-muted">
                              {failure.entity_id}
                            </span>
                          </div>
                          <span className="text-xs text-danger">{failure.error}</span>
                        </div>
                      ))}
                    </div>
                    {result.failed > result.failures.length ? (
                      <p className="text-xs text-muted">
                        Showing the first {result.failures.length} of {result.failed}{" "}
                        failures.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <ActionButtonWithPending
                type="button"
                variant="secondary"
                onPress={() => state.close()}
                isDisabled={jobIsActive}
              >
                Close
              </ActionButtonWithPending>
              {!jobLogId ? (
                <ActionButtonWithPending
                  type="button"
                  variant="primary"
                  onPress={handleStart}
                  isPending={resolve.isPending}
                  isDisabled={propertyIds.length === 0}
                >
                  Resolve locations
                </ActionButtonWithPending>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
