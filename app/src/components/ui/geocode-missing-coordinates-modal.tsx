import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Modal, useOverlayState } from "@heroui/react";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useJob } from "@/features/jobs/hooks/use-jobs";
import { Routes } from "@/routes/routes";

export type GeocodeMissingCoordinatesModalState = ReturnType<typeof useOverlayState>;

interface MissingCoordinatesCount {
  count: number;
}

interface GeocodeMissingCoordinatesResult {
  job_log_id: string;
  enqueued: number;
  message: string;
}

interface GeocodeCoordinatesJobResult {
  total: number;
  processed: number;
  geocoded: number;
  failed: number;
}

const ACTIVE_JOB_STATUSES = new Set(["WAITING", "ACTIVE", "DELAYED", "PAUSED"]);

export function GeocodeMissingCoordinatesModal({
  state,
  countQuery,
  geocode,
}: {
  state: GeocodeMissingCoordinatesModalState;
  countQuery: UseQueryResult<MissingCoordinatesCount, Error>;
  geocode: UseMutationResult<GeocodeMissingCoordinatesResult, Error, void>;
}) {
  const [jobLogId, setJobLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setJobLogId(null);
    }
  }, [state.isOpen]);

  const { data: job } = useJob(jobLogId ?? "");
  const result = job?.result as GeocodeCoordinatesJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);
  const missingCount = countQuery.data?.count ?? 0;

  const handleStart = () => {
    geocode.mutate(undefined, {
      onSuccess: (started) => setJobLogId(started.job_log_id),
    });
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!jobIsActive}>
        <Modal.Container>
          <Modal.Dialog className="max-w-md w-full">
            <Modal.Header>
              <Modal.Heading>Find missing coordinates</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                {!jobLogId ? (
                  countQuery.isPending ? (
                    <p className="text-sm text-muted">Checking for properties missing coordinates…</p>
                  ) : countQuery.isError ? (
                    <p className="text-sm text-danger">
                      Could not check how many properties are missing coordinates.
                    </p>
                  ) : missingCount === 0 ? (
                    <p className="text-sm text-muted">
                      Every property already has coordinates. Nothing to do.
                    </p>
                  ) : (
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{missingCount}</span>{" "}
                      {missingCount === 1 ? "property is" : "properties are"} missing coordinates.
                      Geocode {missingCount === 1 ? "it" : "them"} via Google Maps? Runs in the
                      background — progress shows here and in Job queue.
                    </p>
                  )
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
                        Found {result.total} — {result.processed} checked, {result.geocoded}{" "}
                        updated, {result.failed} failed.
                      </p>
                    ) : (
                      <p className="text-sm text-muted">Starting…</p>
                    )}
                  </div>
                )}
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
                  isPending={geocode.isPending}
                  isDisabled={countQuery.isPending || countQuery.isError || missingCount === 0}
                >
                  Find coordinates
                </ActionButtonWithPending>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
