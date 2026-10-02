import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button, Checkbox, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Routes } from "@/routes/routes";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import {
  useAgencyWatermarkSettings,
  useCalculateStaleCrmImages,
  useEnqueueStaleCrmImagesReplace,
} from "@/features/user-properties/hooks/use-user-properties";
import { useJob } from "@/features/jobs/hooks/use-jobs";
import type {
  AgencyWatermarkSettings,
  StaleCrmImagePropertyCandidate,
  StaleCrmImagesReplaceJobResult,
} from "@/features/user-properties/interfaces/user-properties.interfaces";

export type StaleCrmImagesModalState = ReturnType<typeof useOverlayState>;

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

export function StaleCrmImagesModal({ state }: { state: StaleCrmImagesModalState }) {
  const [step, setStep] = useState<Step>("select-agencies");
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<StaleCrmImagePropertyCandidate[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [jobLogId, setJobLogId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const deleteConfirm = useOverlayState();
  const bodyContentRef = useRef<HTMLDivElement>(null);

  // See image-cap-excess-images-modal.tsx for the full history of why both
  // of these fixes are load-bearing (overflow-clip on Modal.Dialog, this
  // useLayoutEffect scroll reset): Modal.Dialog's own content can exceed its
  // max-h-[85vh] box even though Modal.Body separately handles its own
  // overflow, so without overflow-clip the browser's native
  // scroll-into-view can scroll Dialog itself and clip its Header; and
  // useEffect (vs useLayoutEffect) here would paint one frame at the old
  // step's scroll position before resetting, visible as a jump.
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
    setExpandedImage(null);
  }, [state.isOpen]);

  useEffect(() => {
    if (!expandedImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedImage]);

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

  const calculate = useCalculateStaleCrmImages();
  const replace = useEnqueueStaleCrmImagesReplace();
  const { data: job } = useJob(jobLogId ?? "");
  const jobResult = job?.result as StaleCrmImagesReplaceJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);

  const byAgency = useMemo(() => {
    const map = new Map<string, StaleCrmImagePropertyCandidate[]>();
    for (const c of candidates) {
      const list = map.get(c.agency_name) ?? [];
      list.push(c);
      map.set(c.agency_name, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [candidates]);

  const approvedCandidates = candidates.filter((c) => approvedIds.has(c.user_property_id));
  const approvedImageCount = approvedCandidates.reduce(
    (sum, c) => sum + c.mismatches.length,
    0,
  );
  const totalImageCount = candidates.reduce((sum, c) => sum + c.mismatches.length, 0);

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

  const handleConfirmReplace = () => {
    const items = approvedCandidates.flatMap((c) =>
      c.mismatches.map((m) => ({
        user_property_id: c.user_property_id,
        crm_image_id: m.crm_image_id,
        new_source_image: m.new_source_image,
        position: m.position,
        show_on_site: m.show_on_site,
        show_on_groups: m.show_on_groups,
        show_on_foreign_agents: m.show_on_foreign_agents,
      })),
    );
    if (items.length === 0) return;
    replace.mutate(
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
            <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-4xl max-h-[85vh] overflow-clip">
              <Modal.Header>
                <Modal.Heading>Stale CRM images (content changed)</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <div ref={bodyContentRef} className="flex min-w-0 flex-col gap-4 pb-2 pr-1">
                  {step === "select-agencies" ? (
                    <>
                      <p className="text-sm text-muted">
                        Pick the agencies to scan. For each property, this finds CRM images
                        whose content no longer matches the local image we now have at the
                        same position — e.g. a photo was dewatermarked locally but the push
                        to EstateWeb was skipped or never ran. Replacing deletes the old CRM
                        image by its known id and uploads the current local one in its place
                        — never a fuzzy text match, so it can't create a duplicate.
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
                        {candidates.length} properties / {approvedImageCount} of{" "}
                        {totalImageCount} images selected for replacement. Uncheck any
                        property you're not sure about.
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
                              {items.reduce((s, c) => s + c.mismatches.length, 0)} images
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
                                    aria-label="Approve for replacement"
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
                                {c.mismatches.map((m) => (
                                  <div key={m.crm_image_id} className="flex flex-shrink-0 gap-2">
                                    <div className="flex w-28 flex-col gap-1">
                                      <span className="w-fit rounded bg-danger/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-danger">
                                        Remove
                                      </span>
                                      <button
                                        type="button"
                                        className="h-20 w-28 cursor-zoom-in overflow-hidden rounded-md border-2 border-danger/50 bg-surface-secondary"
                                        onClick={() =>
                                          m.old_source_image &&
                                          setExpandedImage(m.old_source_image)
                                        }
                                        disabled={!m.old_source_image}
                                      >
                                        {m.old_source_image ? (
                                          <img
                                            src={m.old_source_image}
                                            alt={`Stale, CRM image ${m.crm_image_id}`}
                                            loading="lazy"
                                            className="h-full w-full object-cover"
                                          />
                                        ) : null}
                                      </button>
                                      <span className="font-mono text-[0.65rem] text-muted">
                                        CRM img #{m.crm_image_id}
                                      </span>
                                    </div>
                                    <div className="flex w-28 flex-col gap-1">
                                      <span className="w-fit rounded bg-success/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-success">
                                        Upload
                                      </span>
                                      <button
                                        type="button"
                                        className="h-20 w-28 cursor-zoom-in overflow-hidden rounded-md border-2 border-success/50 bg-surface-secondary"
                                        onClick={() => setExpandedImage(m.new_source_image)}
                                      >
                                        <img
                                          src={m.new_source_image}
                                          alt="Current local image"
                                          loading="lazy"
                                          className="h-full w-full object-cover"
                                        />
                                      </button>
                                      <span className="font-mono text-[0.65rem] text-muted">
                                        position {m.position + 1}
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
                          {jobIsActive ? "Replacing in the background…" : "Finished"}
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
                            {jobResult.replaced} replaced, {jobResult.failed} failed
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
                                    item.status === "replaced" ? "text-success" : "text-danger"
                                  }
                                >
                                  {item.status === "replaced" ? "Replaced" : item.error || "Failed"}
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
                      Replace {approvedImageCount} approved image
                      {approvedImageCount === 1 ? "" : "s"}
                    </ActionButtonWithPending>
                  </>
                ) : null}
              </Modal.Footer>

              {/* Deliberately NOT a React portal to document.body -- see
                  image-cap-excess-images-modal.tsx for the full writeup.
                  Short version: HeroUI's outside-press dismiss checks real
                  DOM containment against the dialog's own subtree. A
                  document.body portal is a DOM sibling, not a descendant, so
                  a real click on it was being treated as "outside the
                  modal" and closing the whole modal underneath, losing all
                  review progress -- reproduced live with a real (trusted)
                  click, not just reasoned about. Rendering this as a plain
                  child of Modal.Dialog keeps it a genuine descendant, and it
                  still renders as a full-viewport overlay unclipped by
                  Dialog's overflow-clip since position:fixed ignores
                  ancestor overflow regardless of DOM nesting depth (as long
                  as no ancestor has its own transform/filter/perspective --
                  Dialog has none). */}
              {expandedImage ? (
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
                </div>
              ) : null}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmationDialog
        state={deleteConfirm}
        title={`Replace ${approvedImageCount} stale CRM image${approvedImageCount === 1 ? "" : "s"}?`}
        description="This deletes each approved old image from EstateWeb and uploads the current local image in its place. This cannot be undone."
        confirmLabel="Replace"
        onConfirm={handleConfirmReplace}
        isPending={replace.isPending}
      />
    </>
  );
}
