import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Routes } from "@/routes/routes";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import {
  useAgencyWatermarkSettings,
  useCalculateImageCapExcessImages,
  useEnqueueImageCapExcessImagesCleanup,
} from "@/features/user-properties/hooks/use-user-properties";
import { useJob } from "@/features/jobs/hooks/use-jobs";
import type {
  AgencyWatermarkSettings,
  ImageCapExcessImagesCleanupJobResult,
  ImageCapExcessPropertyCandidate,
} from "@/features/user-properties/interfaces/user-properties.interfaces";

export type ImageCapExcessImagesModalState = ReturnType<typeof useOverlayState>;

type Step = "select-agencies" | "review" | "running";

const ACTIVE_JOB_STATUSES = new Set(["WAITING", "ACTIVE", "DELAYED", "PAUSED"]);

function describeImageCap(settings: AgencyWatermarkSettings[] | undefined): {
  text: string;
  isActive: boolean;
} {
  if (!settings || settings.length === 0) {
    return { text: "Not tracked", isActive: false };
  }
  const first = settings[0];
  const keepPart =
    first.max_image_count == null ? "Keep all" : `Keep ${first.max_image_count}`;
  const extra =
    settings.length > 1
      ? ` (+${settings.length - 1} more tracker${settings.length - 1 === 1 ? "" : "s"})`
      : "";
  return { text: `${keepPart}${extra}`, isActive: true };
}

export function ImageCapExcessImagesModal({
  state,
}: {
  state: ImageCapExcessImagesModalState;
}) {
  const [step, setStep] = useState<Step>("select-agencies");
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<ImageCapExcessPropertyCandidate[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [jobLogId, setJobLogId] = useState<string | null>(null);
  const deleteConfirm = useOverlayState();
  const bodyContentRef = useRef<HTMLDivElement>(null);

  // Modal.Body is the single scroll container (see the 85vh/nested-scroll fix
  // above). It doesn't reset on its own when the step changes, so scrolling
  // down to reach a bottom agency/property in one step leaves the next
  // step's content opening at that same scroll offset -- the header and
  // summary line end up scrolled out of view, looking "cut off". Must be
  // useLayoutEffect, not useEffect: useEffect fires after the browser has
  // already painted the new step at the old (carried-over) scroll position,
  // so the cut-off state is visible for a frame before snapping back --
  // useLayoutEffect runs before paint, so the reset is never visible.
  useLayoutEffect(() => {
    const scrollEl = bodyContentRef.current?.parentElement;
    if (scrollEl) scrollEl.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    if (state.isOpen) return;
    setStep("select-agencies");
    setSelectedAgencyIds(new Set());
    setCandidates([]);
    setApprovedIds(new Set());
    setJobLogId(null);
  }, [state.isOpen]);

  // The admin agencies endpoint takes `limit` literally (Prisma `take`), unlike
  // the trackable-agencies endpoint elsewhere in the app -- 0 means "zero rows",
  // not "unlimited". Use a limit comfortably above the real agency count instead.
  const { data: agenciesData, isPending: agenciesPending } = useAgencies(
    { page: 1, limit: 500 },
    { enabled: state.isOpen },
  );
  const agencies = agenciesData?.data ?? [];

  const { data: watermarkSettings } = useAgencyWatermarkSettings({
    enabled: state.isOpen,
  });
  const settingsByAgency = useMemo(() => {
    const map = new Map<string, AgencyWatermarkSettings[]>();
    for (const setting of watermarkSettings ?? []) {
      const list = map.get(setting.source_agency_id) ?? [];
      list.push(setting);
      map.set(setting.source_agency_id, list);
    }
    return map;
  }, [watermarkSettings]);

  const calculate = useCalculateImageCapExcessImages();
  const cleanup = useEnqueueImageCapExcessImagesCleanup();
  const { data: job } = useJob(jobLogId ?? "");
  const jobResult = job?.result as ImageCapExcessImagesCleanupJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);

  const highConfidence = useMemo(
    () => candidates.filter((c) => c.is_high_confidence),
    [candidates],
  );
  const needsReview = useMemo(
    () => candidates.filter((c) => !c.is_high_confidence),
    [candidates],
  );
  const byAgency = useMemo(() => {
    const map = new Map<string, ImageCapExcessPropertyCandidate[]>();
    for (const c of highConfidence) {
      const list = map.get(c.agency_name) ?? [];
      list.push(c);
      map.set(c.agency_name, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [highConfidence]);

  const approvedCandidates = highConfidence.filter((c) => approvedIds.has(c.user_property_id));
  const approvedImageCount = approvedCandidates.reduce((sum, c) => sum + c.excess_count, 0);

  const toggleAgency = (id: string) => {
    setSelectedAgencyIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCalculate = () => {
    if (selectedAgencyIds.size === 0) return;
    calculate.mutate(
      { source_agency_ids: [...selectedAgencyIds] },
      {
        onSuccess: (result) => {
          setCandidates(result);
          setApprovedIds(
            new Set(
              result.filter((c) => c.is_high_confidence).map((c) => c.user_property_id),
            ),
          );
          setStep("review");
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    const items = approvedCandidates.flatMap((c) =>
      c.excess_images.map((img) => ({
        user_property_id: c.user_property_id,
        crm_image_id: img.id,
      })),
    );
    if (items.length === 0) return;
    cleanup.mutate(
      { items },
      {
        onSuccess: (result) => {
          setJobLogId(result.job_log_id);
          setStep("running");
        },
      },
    );
  };

  return (
    <>
      <Modal state={state}>
        <Modal.Backdrop isDismissable={!jobIsActive}>
          <Modal.Container>
            {/* overflow-clip (not the library's default overflow-hidden) is load-bearing:
                Modal.Dialog's own content (header+body+footer) can exceed its max-h-[85vh]
                box even though Modal.Body internally scrolls its overflow via its own
                overflow-y-auto -- Dialog itself still measures a scrollHeight taller than
                its clientHeight. With overflow-hidden, Dialog is still a valid scroll
                container, so the browser's native "scroll the focused element into view"
                (triggered by clicking a checkbox near the bottom of a list) can target
                Dialog as well as Body, scrolling Dialog and clipping its own Header out of
                view -- the "header disappears / gap before footer" bug. overflow-clip
                keeps the same visual clipping but is explicitly a non-scroll-container per
                spec, so Dialog can no longer be scrolled by anything, native or otherwise;
                Modal.Body remains the only element that actually scrolls. Verified live by
                reproducing the bug, confirming dialog.scrollTop was non-zero, then
                confirming overflow-clip makes dialog.scrollTop stay 0 even after the same
                scrollIntoView call that used to move it. */}
            <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-4xl max-h-[85vh] overflow-clip">
              <Modal.Header>
                <Modal.Heading>Excess CRM images (image cap)</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <div ref={bodyContentRef} className="flex min-w-0 flex-col gap-4 pb-2 pr-1">
                  {step === "select-agencies" ? (
                    <>
                      <p className="text-sm text-muted">
                        Pick the agencies to scan. For each property, this finds CRM images
                        still live on EstateWeb beyond what the local image cap keeps — e.g. the
                        cap was lowered and the trim never reached the CRM. The clean, already-kept
                        images on the property are left untouched.
                      </p>
                      {agenciesPending ? (
                        <p className="text-sm text-muted">Loading agencies…</p>
                      ) : (
                        <div className="flex flex-col gap-1 rounded-xl border border-border p-2">
                          {agencies.map((agency) => {
                            const summary = describeImageCap(settingsByAgency.get(agency.id));
                            return (
                              <label
                                key={agency.id}
                                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-secondary"
                              >
                                <Checkbox
                                  aria-label={agency.name}
                                  isSelected={selectedAgencyIds.has(agency.id)}
                                  onChange={() => toggleAgency(agency.id)}
                                >
                                  <Checkbox.Control className="size-5">
                                    <Checkbox.Indicator className="size-3.5" />
                                  </Checkbox.Control>
                                </Checkbox>
                                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                  <span className="text-sm text-foreground">{agency.name}</span>
                                  <span
                                    className={`font-mono text-xs ${summary.isActive ? "text-foreground" : "text-muted"}`}
                                  >
                                    {summary.text}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : null}

                  {step === "review" ? (
                    <>
                      <p className="text-sm text-muted">
                        {highConfidence.length} properties / {approvedImageCount} of{" "}
                        {highConfidence.reduce((s, c) => s + c.excess_count, 0)} images selected
                        for deletion. Uncheck any property you're not sure about.
                        {needsReview.length > 0
                          ? ` ${needsReview.length} more properties had an ambiguous image order and are not shown here — they need individual review.`
                          : ""}
                      </p>

                      {byAgency.map(([agencyName, items]) => (
                        <div
                          key={agencyName}
                          className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                              {agencyName}
                            </span>
                            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted">
                              {items.length} properties ·{" "}
                              {items.reduce((s, c) => s + c.excess_count, 0)} images
                            </span>
                          </div>

                          {items.map((c) => (
                            <div
                              key={c.user_property_id}
                              className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-2.5"
                            >
                              <div className="flex items-start gap-3">
                                <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
                                  <Checkbox
                                    aria-label="Approve for deletion"
                                    isSelected={approvedIds.has(c.user_property_id)}
                                    onChange={(isSelected) =>
                                      setApprovedIds((current) => {
                                        const next = new Set(current);
                                        if (isSelected) next.add(c.user_property_id);
                                        else next.delete(c.user_property_id);
                                        return next;
                                      })
                                    }
                                  >
                                    <Checkbox.Control className="size-5">
                                      <Checkbox.Indicator className="size-3.5" />
                                    </Checkbox.Control>
                                  </Checkbox>
                                  Approve
                                </label>
                                <div className="min-w-0 flex-1">
                                  <p className="break-words text-sm font-medium text-foreground">
                                    {c.title}
                                  </p>
                                  <p className="font-mono text-xs text-muted">
                                    source id <b className="text-foreground">{c.property_id}</b>
                                    {" · "}CRM property{" "}
                                    <b className="text-foreground">{c.crm_property_id}</b>
                                    {" · "}local {c.local_image_count} vs CRM{" "}
                                    {c.crm_image_count}
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {c.excess_images.map((img) => (
                                  <div key={img.id} className="flex w-28 flex-shrink-0 flex-col gap-1">
                                    <span className="w-fit rounded bg-danger/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-danger">
                                      Remove
                                    </span>
                                    <div className="h-20 w-28 overflow-hidden rounded-md border-2 border-danger/50 bg-surface-secondary">
                                      {img.source_image ? (
                                        <img
                                          src={img.source_image}
                                          alt={`Excess CRM image ${img.id}`}
                                          loading="lazy"
                                          className="h-full w-full object-cover"
                                        />
                                      ) : null}
                                    </div>
                                    <span className="font-mono text-[0.65rem] text-muted">
                                      CRM img #{img.id}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </>
                  ) : null}

                  {step === "running" ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {jobIsActive ? "Deleting in the background…" : "Finished"}
                        </span>
                        {jobLogId ? (
                          <Link
                            to={Routes.admin.jobs.detail(jobLogId)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-accent hover:underline"
                          >
                            View in Job queue
                          </Link>
                        ) : null}
                      </div>
                      {jobResult ? (
                        <>
                          <p className="text-sm text-muted">
                            {jobResult.processed} of {jobResult.total} processed —{" "}
                            {jobResult.deleted} deleted, {jobResult.failed} failed
                          </p>
                          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                            {jobResult.items.map((item) => (
                              <div
                                key={item.crm_image_id}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <span className="font-mono text-foreground">
                                  CRM img #{item.crm_image_id}
                                </span>
                                <span
                                  className={
                                    item.status === "deleted" ? "text-success" : "text-danger"
                                  }
                                >
                                  {item.status === "deleted" ? "Deleted" : item.error || "Failed"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted">Starting…</p>
                      )}
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

                {step === "select-agencies" ? (
                  <ActionButtonWithPending
                    type="button"
                    variant="primary"
                    onPress={handleCalculate}
                    isPending={calculate.isPending}
                    isDisabled={selectedAgencyIds.size === 0}
                  >
                    Calculate
                  </ActionButtonWithPending>
                ) : null}

                {step === "review" ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onPress={() => setStep("select-agencies")}
                    >
                      Back
                    </Button>
                    <ActionButtonWithPending
                      type="button"
                      variant="danger"
                      onPress={() => deleteConfirm.open()}
                      isDisabled={approvedCandidates.length === 0}
                    >
                      Delete {approvedImageCount} approved image
                      {approvedImageCount === 1 ? "" : "s"}
                    </ActionButtonWithPending>
                  </>
                ) : null}
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmationDialog
        state={deleteConfirm}
        title={`Delete ${approvedImageCount} excess CRM image${approvedImageCount === 1 ? "" : "s"}?`}
        description="This permanently deletes each approved image from EstateWeb. The images already kept on the property are left untouched. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        isPending={cleanup.isPending}
      />
    </>
  );
}
