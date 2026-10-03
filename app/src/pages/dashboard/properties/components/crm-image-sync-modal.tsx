import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Routes } from "@/routes/routes";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import {
  useAgencyWatermarkSettings,
  usePreviewCrmImageSync,
  useRunCrmImageSync,
} from "@/features/user-properties/hooks/use-user-properties";
import { useJob } from "@/features/jobs/hooks/use-jobs";
import type {
  AgencyWatermarkSettings,
  CrmImageSyncJobResult,
  CrmImageSyncPreviewAgency,
} from "@/features/user-properties/interfaces/user-properties.interfaces";

export type CrmImageSyncModalState = ReturnType<typeof useOverlayState>;

type Step = "select-agencies" | "preview" | "running";

const ACTIVE_JOB_STATUSES = new Set(["WAITING", "ACTIVE", "DELAYED", "PAUSED"]);
const SAMPLE_LIMIT = 15;

function describeImageCap(settings: AgencyWatermarkSettings[] | undefined) {
  if (!settings || settings.length === 0) return { text: "Not tracked", isActive: false };
  const first = settings[0];
  return {
    text: first.max_image_count == null ? "Keep all" : `Keep ${first.max_image_count}`,
    isActive: true,
  };
}

// Mounted only while open, so every open starts from a clean slate.
export function CrmImageSyncModal({ state }: { state: CrmImageSyncModalState }) {
  return state.isOpen ? <CrmImageSyncModalContent state={state} /> : null;
}

function CrmImageSyncModalContent({ state }: { state: CrmImageSyncModalState }) {
  const [step, setStep] = useState<Step>("select-agencies");
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<CrmImageSyncPreviewAgency[]>([]);
  const [jobLogId, setJobLogId] = useState<string | null>(null);
  const runConfirm = useOverlayState();
  const bodyContentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scrollEl = bodyContentRef.current?.parentElement;
    if (scrollEl) scrollEl.scrollTop = 0;
  }, [step]);

  const { data: agenciesData, isPending: agenciesPending } = useAgencies(
    { page: 1, limit: 500 },
    { enabled: state.isOpen },
  );
  const agencies = agenciesData?.data ?? [];
  const { data: watermarkSettings } = useAgencyWatermarkSettings({ enabled: state.isOpen });
  const settingsByAgency = useMemo(() => {
    const map = new Map<string, AgencyWatermarkSettings[]>();
    for (const setting of watermarkSettings ?? []) {
      const list = map.get(setting.source_agency_id) ?? [];
      list.push(setting);
      map.set(setting.source_agency_id, list);
    }
    return map;
  }, [watermarkSettings]);

  const previewMutation = usePreviewCrmImageSync();
  const run = useRunCrmImageSync();
  const { data: job } = useJob(jobLogId ?? "");
  const jobResult = job?.result as CrmImageSyncJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);

  const totals = useMemo(
    () =>
      preview.reduce(
        (acc, a) => ({
          needsSync: acc.needsSync + a.needs_sync,
          toDelete: acc.toDelete + a.to_delete,
          toUpload: acc.toUpload + a.to_upload,
        }),
        { needsSync: 0, toDelete: 0, toUpload: 0 },
      ),
    [preview],
  );

  const toggleAgency = (id: string) => {
    setSelectedAgencyIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePreview = () => {
    if (selectedAgencyIds.size === 0) return;
    previewMutation.mutate(
      { source_agency_ids: [...selectedAgencyIds] },
      {
        onSuccess: (result) => {
          setPreview(result);
          setStep("preview");
        },
      },
    );
  };

  const handleRun = () => {
    run.mutate(
      { source_agency_ids: [...selectedAgencyIds] },
      {
        onSuccess: (result) => {
          setJobLogId(result.job_log_id);
          setStep("running");
          runConfirm.close();
        },
      },
    );
  };

  return (
    <>
      <Modal state={state}>
        <Modal.Backdrop isDismissable={!jobIsActive}>
          <Modal.Container>
            {/* overflow-clip, not overflow-hidden: overflow-hidden leaves Dialog
                a valid scroll container, so the browser's native scroll-into-view
                (clicking a checkbox near the bottom of the list) could scroll
                Dialog itself and hide its header. overflow-clip keeps Modal.Body
                the only element that scrolls. */}
            <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-4xl max-h-[85vh] overflow-clip">
              <Modal.Header>
                <Modal.Heading>Sync CRM images to "images to keep"</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <div ref={bodyContentRef} className="flex min-w-0 flex-col gap-4 pb-2 pr-1">
                  {step === "select-agencies" ? (
                    <>
                      <p className="text-sm text-muted">
                        For every property of the selected agencies, our photos become the
                        agency's "images to keep" and EstateWeb gets exactly those photos,
                        once each, in order — duplicates, leftover originals and extra
                        photos are removed, missing ones are uploaded. No Dewatermark credits
                        are used. You'll see a preview before anything changes.
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

                  {step === "preview" ? (
                    <>
                      <p className="text-sm text-muted">
                        {totals.needsSync} properties need changes: {totals.toDelete} photos
                        will be deleted from EstateWeb and {totals.toUpload} uploaded. Based
                        on our last copy of EstateWeb — the run re-checks each property live
                        first, so final numbers can differ slightly.
                      </p>
                      {preview.map((agency) => (
                        <div
                          key={`${agency.agency_id}`}
                          className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {agency.agency_name}{" "}
                              <span className="font-mono text-xs font-normal text-muted">
                                {agency.max_image_count == null
                                  ? "keep all"
                                  : `keep ${agency.max_image_count}`}
                              </span>
                            </span>
                            <span className="font-mono text-xs text-muted">
                              {agency.needs_sync}/{agency.properties} properties · EstateWeb{" "}
                              {agency.crm_now} → {agency.crm_target} photos
                            </span>
                          </div>
                          <p className="font-mono text-xs text-muted">
                            delete {agency.to_delete} · upload {agency.to_upload}
                            {agency.skipped_not_ours > 0
                              ? ` · ${agency.skipped_not_ours} skipped (listing wasn't created by us)`
                              : ""}
                          </p>
                          {agency.skipped_source_shrank.length > 0 ? (
                            <div className="rounded-lg bg-warning/10 p-2 text-xs">
                              <p className="font-medium text-foreground">
                                {agency.skipped_source_shrank.length} skipped — our crawler now reads
                                fewer photos than this listing used to have, so syncing could delete
                                real photos. Left untouched for review:
                              </p>
                              <ul className="mt-1 flex flex-col gap-0.5">
                                {agency.skipped_source_shrank.map((p) => (
                                  <li key={p.user_property_id}>
                                    <Link
                                      to={Routes.admin.properties.userDetail(p.user_property_id)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="break-words text-foreground hover:underline"
                                    >
                                      {p.title}
                                    </Link>{" "}
                                    <span className="font-mono text-muted">
                                      {p.property_id} · source {p.source_peak} → {p.source_now} ·
                                      EstateWeb {p.crm_now}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {agency.samples.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[520px] text-xs">
                                <thead>
                                  <tr className="text-left text-muted">
                                    <th className="py-1 pr-2 font-medium">Property</th>
                                    <th className="py-1 pr-2 text-right font-medium">EstateWeb</th>
                                    <th className="py-1 pr-2 text-right font-medium">Delete</th>
                                    <th className="py-1 text-right font-medium">Upload</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {agency.samples.slice(0, SAMPLE_LIMIT).map((p) => (
                                    <tr key={p.user_property_id} className="border-t border-border">
                                      <td className="py-1 pr-2">
                                        <Link
                                          to={Routes.admin.properties.userDetail(p.user_property_id)}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="break-words text-foreground hover:text-accent hover:underline"
                                        >
                                          {p.title}
                                        </Link>
                                        <span className="ml-1 font-mono text-muted">{p.property_id}</span>
                                      </td>
                                      <td className="py-1 pr-2 text-right font-mono">
                                        {p.crm_now} → {p.target}
                                      </td>
                                      <td className="py-1 pr-2 text-right font-mono">{p.to_delete}</td>
                                      <td className="py-1 text-right font-mono">{p.to_upload}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {agency.samples.length > SAMPLE_LIMIT ? (
                                <p className="pt-1 text-xs text-muted">
                                  + {agency.samples.length - SAMPLE_LIMIT} more properties
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </>
                  ) : null}

                  {step === "running" ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {jobIsActive ? "Syncing in the background…" : "Finished"}
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
                        <p className="text-sm text-muted">
                          {jobResult.processed} of {jobResult.total} properties —{" "}
                          {jobResult.reconciled} fixed, {jobResult.in_sync} already correct,{" "}
                          {jobResult.skipped} skipped, {jobResult.failed} failed ·{" "}
                          {jobResult.deleted} photos deleted, {jobResult.uploaded} uploaded
                        </p>
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
                    onPress={handlePreview}
                    isPending={previewMutation.isPending}
                    isDisabled={selectedAgencyIds.size === 0}
                  >
                    Preview
                  </ActionButtonWithPending>
                ) : null}
                {step === "preview" ? (
                  <>
                    <Button type="button" variant="secondary" onPress={() => setStep("select-agencies")}>
                      Back
                    </Button>
                    <ActionButtonWithPending
                      type="button"
                      variant="danger"
                      onPress={() => runConfirm.open()}
                      isDisabled={totals.needsSync === 0}
                    >
                      Sync {totals.needsSync} properties
                    </ActionButtonWithPending>
                  </>
                ) : null}
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmationDialog
        state={runConfirm}
        title={`Sync ${totals.needsSync} properties to EstateWeb?`}
        description={`About ${totals.toDelete} photos will be permanently deleted from EstateWeb and ${totals.toUpload} uploaded, so each property ends up with exactly its "images to keep". Deleted photos cannot be restored.`}
        confirmLabel="Sync"
        onConfirm={handleRun}
        isPending={run.isPending}
      />
    </>
  );
}
