import { useEffect, useLayoutEffect, useMemo, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button, Checkbox, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Routes } from "@/routes/routes";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import {
  useAgencyWatermarkSettings,
  useCalculateDuplicateWatermarkImages,
  useEnqueueDuplicateWatermarkCleanup,
} from "@/features/user-properties/hooks/use-user-properties";
import { useJob } from "@/features/jobs/hooks/use-jobs";
import type {
  AgencyWatermarkSettings,
  DuplicateWatermarkCleanupJobResult,
  DuplicateWatermarkImageCandidate,
  DuplicateWatermarkPropertyCandidate,
} from "@/features/user-properties/interfaces/user-properties.interfaces";

export type DuplicateWatermarkImagesModalState = ReturnType<typeof useOverlayState>;

type Step = "select-agencies" | "review" | "running";

const ACTIVE_JOB_STATUSES = new Set(["WAITING", "ACTIVE", "DELAYED", "PAUSED"]);

// Source-site image hosts sometimes block hotlinking or the photo has since
// been removed -- swap a broken <img> for a plain placeholder instead of the
// browser's default broken-image icon.
const BROKEN_IMAGE_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='112' height='80'%3E%3Crect width='112' height='80' fill='%23d9d4c8'/%3E%3C/svg%3E";

function handleThumbnailError(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  img.onerror = null;
  img.src = BROKEN_IMAGE_FALLBACK;
}

// A single original photo can have more than one stale CRM row (e.g. the
// source site re-serves it at multiple sizes, each uploaded separately at
// some point) -- all genuinely stale, all replaced by the same one clean
// image. Grouping by after_image shows that real one-replacement-to-many-
// stale-copies relationship instead of repeating what looks like an
// identical remove/keep pair for each row.
function groupDuplicatesByAfterImage(
  duplicates: DuplicateWatermarkImageCandidate[],
): Array<{ after_image: string; removes: DuplicateWatermarkImageCandidate[] }> {
  const order: string[] = [];
  const groups = new Map<string, DuplicateWatermarkImageCandidate[]>();
  for (const img of duplicates) {
    if (!groups.has(img.after_image)) {
      order.push(img.after_image);
      groups.set(img.after_image, []);
    }
    groups.get(img.after_image)!.push(img);
  }
  return order.map((after_image) => ({ after_image, removes: groups.get(after_image)! }));
}

function describeWatermarkSettings(settings: AgencyWatermarkSettings[] | undefined): {
  text: string;
  isActive: boolean;
} {
  if (!settings || settings.length === 0) {
    return { text: "Not tracked", isActive: false };
  }
  // remove_watermark and max_image_count are independent settings -- an
  // agency can have watermark removal off but still cap how many images are
  // kept, so both are shown regardless of each other.
  const first = settings[0];
  const watermarkPart = first.remove_watermark
    ? `Dewatermark first ${first.watermark_image_count}`
    : "Watermark off";
  const keepPart =
    first.max_image_count == null ? "Keep all" : `Keep ${first.max_image_count}`;
  const extra =
    settings.length > 1
      ? ` (+${settings.length - 1} more tracker${settings.length - 1 === 1 ? "" : "s"})`
      : "";
  return {
    text: `${watermarkPart} · ${keepPart}${extra}`,
    isActive: true,
  };
}

export function DuplicateWatermarkImagesModal({
  state,
}: {
  state: DuplicateWatermarkImagesModalState;
}) {
  const [step, setStep] = useState<Step>("select-agencies");
  const bodyScrollId = "duplicate-watermark-images-modal-body";
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<DuplicateWatermarkPropertyCandidate[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [jobLogId, setJobLogId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const deleteConfirm = useOverlayState();

  useEffect(() => {
    if (state.isOpen) return;
    setStep("select-agencies");
    setSelectedAgencyIds(new Set());
    setCandidates([]);
    setApprovedIds(new Set());
    setJobLogId(null);
    setExpandedImage(null);
  }, [state.isOpen]);

  // Portaled to document.body (not rendered inside Modal.Dialog) so it isn't
  // clipped by the dialog's own overflow-clip, and sits above the modal
  // backdrop's z-50 via z-[60].
  useEffect(() => {
    if (!expandedImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedImage]);

  // Modal.Body is one persistent DOM node across both steps -- only its
  // children swap, its scrollTop does not reset on its own. Must be
  // useLayoutEffect, not useEffect: useEffect fires after the browser
  // paints, so the new step's DOM would render for one visible frame with
  // the OLD step's leftover scrollTop still applied (valid as long as the
  // new content is tall enough), THEN snap to 0 -- that flash is the
  // "content jumps up" symptom. useLayoutEffect runs synchronously before
  // paint, so the reset is already in place in the first visible frame.
  // Direct scrollTop assignment (not .scrollTo) to stay unambiguously
  // synchronous regardless of any scroll-behavior CSS.
  useLayoutEffect(() => {
    const el = document.getElementById(bodyScrollId);
    if (el) el.scrollTop = 0;
  }, [step]);

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
  const watermarkSettingsByAgency = useMemo(() => {
    const map = new Map<string, AgencyWatermarkSettings[]>();
    for (const setting of watermarkSettings ?? []) {
      const list = map.get(setting.source_agency_id) ?? [];
      list.push(setting);
      map.set(setting.source_agency_id, list);
    }
    return map;
  }, [watermarkSettings]);

  const calculate = useCalculateDuplicateWatermarkImages();
  const cleanup = useEnqueueDuplicateWatermarkCleanup();
  const { data: job } = useJob(jobLogId ?? "");
  const jobResult = job?.result as DuplicateWatermarkCleanupJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);

  const byAgency = useMemo(() => {
    const map = new Map<string, DuplicateWatermarkPropertyCandidate[]>();
    for (const c of candidates) {
      const list = map.get(c.agency_name) ?? [];
      list.push(c);
      map.set(c.agency_name, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [candidates]);

  const approvedCandidates = candidates.filter((c) => approvedIds.has(c.user_property_id));
  const approvedImageCount = approvedCandidates.reduce(
    (sum, c) => sum + c.genuine_duplicate_count,
    0,
  );

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
          setApprovedIds(new Set(result.map((c) => c.user_property_id)));
          setStep("review");
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    const items = approvedCandidates.flatMap((c) =>
      c.genuine_duplicates.map((img) => ({
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
          <Modal.Container placement="top">
            {/* overflow-clip overrides HeroUI's own overflow-hidden on this element.
                hidden still makes an element a valid (if scrollbar-less) scroll
                container for native/programmatic scrolling; since Dialog's own
                natural content height can exceed its max-h cap even though
                Modal.Body separately handles its own overflow, focusing a
                checkbox near the bottom made the browser's native
                scrollIntoView walk up and scroll BOTH Modal.Body (intended)
                and Modal.Dialog itself (not intended) -- scrolling Dialog
                clipped its own Header out of view via Dialog's own clip
                boundary. clip is spec'd to never be a scroll container at
                all, so Dialog's scrollTop now stays inertly at 0 regardless
                of what tries to scroll it. Verified live (DOM measurement +
                visual confirmation), not inferred. */}
            <Modal.Dialog className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-4xl overflow-clip">
              <Modal.Header>
                <Modal.Heading>Duplicate watermarked photos</Modal.Heading>
              </Modal.Header>
              <Modal.Body id={bodyScrollId}>
                {/* pb-2: with short content (e.g. a 7-row agency list), Modal.Dialog's
                    max-h cap means Modal.Body hugs the content with ~zero bottom
                    buffer, so the last row sits flush against Modal.Body's measured
                    edge. react-aria's scrollIntoViewport (private/utils/scrollIntoView.js)
                    re-measures the focused element after nudging it into view and
                    escalates to recentering the whole dialog if it moved >1px -- with
                    zero buffer that 1px rounding tolerance trips easily. A little
                    bottom padding keeps content off that edge. */}
                <div className="flex min-w-0 flex-col gap-4 pb-2 pr-1">
                  {step === "select-agencies" ? (
                    <>
                      <p className="text-sm text-muted">
                        Pick the agencies to scan. For each property, this finds CRM images
                        that are stale, still-watermarked copies left behind after the
                        automatic watermark pipeline produced a clean replacement — a real
                        duplicate, not just a photo outside the image cap.
                      </p>
                      {agenciesPending ? (
                        <p className="text-sm text-muted">Loading agencies…</p>
                      ) : (
                        <div className="flex flex-col gap-1 rounded-xl border border-border p-2">
                          {agencies.map((agency) => {
                            const summary = describeWatermarkSettings(
                              watermarkSettingsByAgency.get(agency.id),
                            );
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
                                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                    {agency.name}
                                  </span>
                                  <span
                                    className={`shrink-0 whitespace-nowrap font-mono text-xs ${summary.isActive ? "text-foreground" : "text-muted"}`}
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
                      {candidates.length === 0 ? (
                        <p className="text-sm text-muted">
                          No verified duplicates found. Detection only flags a CRM image once
                          it can confirm, by an exact fingerprint embedded when the clean
                          replacement was created, which original photo it replaced — this
                          avoids the false positives an earlier guess-from-current-listing-order
                          version produced. Images processed before this fix don't carry that
                          fingerprint and won't be matched automatically; they'd need to go
                          through watermark removal again to become checkable here.
                        </p>
                      ) : (
                        <p className="text-sm text-muted">
                          {candidates.length} properties / {approvedImageCount} of{" "}
                          {candidates.reduce((s, c) => s + c.genuine_duplicate_count, 0)} images
                          selected for deletion. Uncheck any property you're not sure about.
                        </p>
                      )}

                      {byAgency.map(([agencyName, items]) => (
                        <div
                          key={agencyName}
                          className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                              {agencyName}
                            </span>
                            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted">
                              {items.length} properties ·{" "}
                              {items.reduce((s, c) => s + c.genuine_duplicate_count, 0)} images
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
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-3 overflow-x-auto pb-1">
                                {groupDuplicatesByAfterImage(c.genuine_duplicates).map((group) => (
                                  <div
                                    key={group.after_image}
                                    className="flex flex-shrink-0 items-center gap-2"
                                  >
                                    <div className="flex gap-2">
                                      {group.removes.map((img) => (
                                        <div key={img.id} className="flex w-28 flex-col gap-1">
                                          <span className="w-fit rounded bg-danger/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-danger">
                                            Remove
                                          </span>
                                          <button
                                            type="button"
                                            className="h-20 w-28 cursor-zoom-in overflow-hidden rounded-md border-2 border-danger/50 bg-surface-secondary"
                                            onClick={() => setExpandedImage(img.source_image)}
                                          >
                                            <img
                                              src={img.source_image}
                                              alt={`Watermarked, CRM image ${img.id}`}
                                              loading="lazy"
                                              onError={handleThumbnailError}
                                              className="h-full w-full object-cover"
                                            />
                                          </button>
                                          <span className="font-mono text-[0.65rem] text-muted">
                                            CRM img #{img.id}
                                            {group.removes.length > 1
                                              ? " (same photo, other size)"
                                              : ""}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex w-28 flex-col gap-1">
                                      <span className="w-fit rounded bg-success/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-success">
                                        Keep
                                      </span>
                                      <button
                                        type="button"
                                        className="h-20 w-28 cursor-zoom-in overflow-hidden rounded-md border-2 border-success/50 bg-surface-secondary"
                                        onClick={() => setExpandedImage(group.after_image)}
                                      >
                                        <img
                                          src={group.after_image}
                                          alt="Clean replacement"
                                          loading="lazy"
                                          onError={handleThumbnailError}
                                          className="h-full w-full object-cover"
                                        />
                                      </button>
                                      <span className="font-mono text-[0.65rem] text-muted">
                                        already on property
                                      </span>
                                    </div>
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
        title={`Delete ${approvedImageCount} stale watermarked image${approvedImageCount === 1 ? "" : "s"}?`}
        description="This permanently deletes each approved image from EstateWeb. The clean replacement already on the property is left untouched. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        isPending={cleanup.isPending}
      />

      {expandedImage
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
              onClick={() => setExpandedImage(null)}
            >
              <button
                type="button"
                className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                onClick={() => setExpandedImage(null)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
              <img
                src={expandedImage}
                alt="Expanded preview"
                className="max-h-full max-w-full rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
