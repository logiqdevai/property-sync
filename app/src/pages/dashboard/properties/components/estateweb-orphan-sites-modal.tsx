import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  ListBox,
  Modal,
  Select,
  Skeleton,
  TextArea,
  useOverlayState,
} from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EstateWebPushSitesList } from "@/components/ui/estateweb-push-sites-list";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { Routes } from "@/routes/routes";
import type { EstateWebPushSiteSetting } from "@/features/estateweb/interfaces/estateweb-integration-settings.interfaces";
import type {
  EstateWebBulkDeleteByCodesJobResult,
  EstateWebBulkSitesByCodesJobResult,
} from "@/features/estateweb/interfaces/estateweb.interfaces";
import {
  useAvailableIntegrationTargets,
  useUserIntegrationSettings,
} from "@/features/user-integrations/hooks/use-user-integrations";
import {
  useBulkDeleteEstateWebPropertiesByCodes,
  useBulkUpdateEstateWebPropertySites,
  useEstateWebAdminIntegrations,
} from "@/features/estateweb/hooks/use-estateweb";
import { useJob } from "@/features/jobs/hooks/use-jobs";

export type EstateWebOrphanSitesModalState = ReturnType<typeof useOverlayState>;

type Mode = "sites" | "delete";

const NONE_SELECTED = "";
const ACTIVE_JOB_STATUSES = new Set(["WAITING", "ACTIVE", "DELAYED", "PAUSED"]);

function integrationLabel(integration: { userEmail: string; email: string | null }) {
  return integration.email
    ? `${integration.userEmail} (${integration.email})`
    : integration.userEmail;
}

function parseCodes(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  ];
}

export function EstateWebOrphanSitesModal({
  state,
}: {
  state: EstateWebOrphanSitesModalState;
}) {
  const [mode, setMode] = useState<Mode>("sites");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>(NONE_SELECTED);
  const [codesInput, setCodesInput] = useState("");
  const [sites, setSites] = useState<EstateWebPushSiteSetting[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [jobLogId, setJobLogId] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<Mode | null>(null);
  const deleteConfirm = useOverlayState();

  useEffect(() => {
    if (!state.isOpen) {
      setMode("sites");
      setSelectedIntegrationId(NONE_SELECTED);
      setCodesInput("");
      setSites([]);
      setHydrated(false);
      setJobLogId(null);
      setJobKind(null);
    }
  }, [state.isOpen]);

  const { data: integrations, isPending: integrationsPending } = useEstateWebAdminIntegrations(
    state.isOpen,
  );
  const hasIntegration = selectedIntegrationId !== NONE_SELECTED;

  // Same site source "Manage EstateWeb Sites" uses: the account-wide default site list, not a
  // per-property fetch (EstateWeb's property list endpoint doesn't return usable site data).
  const { data: targets = [], isPending: targetsPending } = useAvailableIntegrationTargets();
  const estateWebTarget = targets.find(
    (target) => target.integration_type === IntegrationTypes.ESTATEWEB,
  );
  const settingsTargetId =
    state.isOpen && hasIntegration && mode === "sites" ? estateWebTarget?.id : undefined;
  const { data: settings, isPending: settingsPending } =
    useUserIntegrationSettings(settingsTargetId);

  useEffect(() => {
    if (!state.isOpen || !hasIntegration || mode !== "sites") {
      setHydrated(false);
      return;
    }
    if (hydrated) return;
    if (!settingsTargetId || settingsPending || settings === undefined) return;

    setSites((settings.settings?.estateweb_default_sites ?? []).map((site) => ({ ...site })));
    setHydrated(true);
  }, [state.isOpen, hasIntegration, mode, settings, settingsPending, settingsTargetId, hydrated]);

  const bulkUpdateSites = useBulkUpdateEstateWebPropertySites();
  const bulkDelete = useBulkDeleteEstateWebPropertiesByCodes();
  const { data: job } = useJob(jobLogId ?? "");
  const sitesResult = job?.result as EstateWebBulkSitesByCodesJobResult | undefined;
  const deleteResult = job?.result as EstateWebBulkDeleteByCodesJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);

  const isLoadingSites =
    mode === "sites" &&
    hasIntegration &&
    !hydrated &&
    (targetsPending || !settingsTargetId || settingsPending || settings === undefined);

  const codes = parseCodes(codesInput);
  const isSubmitting = bulkUpdateSites.isPending || bulkDelete.isPending;

  const handleApplySites = () => {
    if (codes.length === 0 || !hasIntegration) return;
    bulkUpdateSites.mutate(
      {
        userIntegrationId: selectedIntegrationId,
        codes,
        sites: sites.filter((site) => site.selected),
      },
      {
        onSuccess: (result) => {
          setJobLogId(result.job_log_id);
          setJobKind("sites");
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (codes.length === 0 || !hasIntegration) return;
    bulkDelete.mutate(
      { userIntegrationId: selectedIntegrationId, codes },
      {
        onSuccess: (result) => {
          setJobLogId(result.job_log_id);
          setJobKind("delete");
        },
      },
    );
  };

  const handleApply = () => {
    if (mode === "sites") handleApplySites();
    else deleteConfirm.open();
  };

  return (
    <>
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!jobIsActive}>
        <Modal.Container>
          <Modal.Dialog className="max-w-2xl w-full">
            <Modal.Header>
              <Modal.Heading>Manage EstateWeb properties by code</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
                <p className="text-sm text-muted">
                  Pick an EstateWeb connection, paste in the property "code" values you want to
                  manage (one per line, or comma/space separated), then choose whether to update
                  site placements or delete the properties outright. Useful for cleaning up
                  orphaned duplicate EstateWeb properties that have no matching record in our
                  system. Runs in the background since this can touch hundreds of properties.
                </p>

                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">EstateWeb connection</span>
                  <Select
                    aria-label="Select EstateWeb integration"
                    selectedKey={selectedIntegrationId}
                    onSelectionChange={(key) => setSelectedIntegrationId(String(key))}
                    isDisabled={integrationsPending || !!jobLogId}
                  >
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item key={NONE_SELECTED} id={NONE_SELECTED}>
                          {integrationsPending ? "Loading…" : "Select an integration…"}
                        </ListBox.Item>
                        {(integrations ?? []).map((integration) => (
                          <ListBox.Item key={integration.id} id={integration.id}>
                            {integrationLabel(integration)}
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                {hasIntegration && !jobLogId ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">Action</span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={mode === "sites" ? "primary" : "secondary"}
                        onPress={() => setMode("sites")}
                      >
                        Update site placements
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={mode === "delete" ? "danger" : "secondary"}
                        onPress={() => setMode("delete")}
                      >
                        Delete properties
                      </Button>
                    </div>
                  </div>
                ) : null}

                {hasIntegration && !jobLogId ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">
                      EstateWeb property codes
                    </span>
                    <TextArea
                      aria-label="EstateWeb property codes"
                      value={codesInput}
                      onChange={(event) => setCodesInput(event.target.value)}
                      placeholder={"4215\n4212\n4209"}
                      rows={5}
                    />
                  </div>
                ) : null}

                {hasIntegration && !jobLogId && mode === "sites" ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Site placements to apply
                    </span>
                    <p className="text-xs text-muted">
                      Deselect all sites to unpublish these properties everywhere.
                    </p>
                    {isLoadingSites ? (
                      <div className="flex flex-col gap-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <Skeleton key={index} className="h-24 w-full rounded-xl" />
                        ))}
                      </div>
                    ) : (
                      <EstateWebPushSitesList
                        sites={sites}
                        onChange={setSites}
                        mode="select"
                        emptyLabel="No EstateWeb sites configured. Add them in Integrations → EstateWeb CMS Configuration."
                      />
                    )}
                  </div>
                ) : null}

                {hasIntegration && !jobLogId && mode === "delete" ? (
                  <p className="text-sm text-danger">
                    This permanently deletes each matched EstateWeb property. This cannot be
                    undone.
                  </p>
                ) : null}

                {jobLogId ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {jobIsActive
                          ? "Running in the background…"
                          : jobKind === "delete"
                            ? "Deletion finished"
                            : "Finished"}
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
                    {jobKind === "delete" ? (
                      deleteResult ? (
                        <>
                          <p className="text-sm text-muted">
                            {deleteResult.processed} of {deleteResult.total} processed —{" "}
                            {deleteResult.deleted} deleted, {deleteResult.failed} failed
                          </p>
                          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                            {deleteResult.items.map((item) => (
                              <div
                                key={item.code}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <span className="font-mono text-foreground">{item.code}</span>
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
                      )
                    ) : sitesResult ? (
                      <>
                        <p className="text-sm text-muted">
                          {sitesResult.processed} of {sitesResult.total} processed —{" "}
                          {sitesResult.updated} updated, {sitesResult.failed} failed
                        </p>
                        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                          {sitesResult.items.map((item) => (
                            <div
                              key={item.code}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span className="font-mono text-foreground">{item.code}</span>
                              <span
                                className={
                                  item.status === "updated" ? "text-success" : "text-danger"
                                }
                              >
                                {item.status === "updated" ? "Updated" : item.error || "Failed"}
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
              {!jobLogId ? (
                <ActionButtonWithPending
                  type="button"
                  variant={mode === "delete" ? "danger" : "primary"}
                  onPress={handleApply}
                  isPending={isSubmitting}
                  isDisabled={!hasIntegration || codes.length === 0 || isLoadingSites}
                >
                  {mode === "delete" ? "Delete" : "Apply to"} {codes.length} code
                  {codes.length === 1 ? "" : "s"}
                </ActionButtonWithPending>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>

      <ConfirmationDialog
        state={deleteConfirm}
        title={`Delete ${codes.length} EstateWeb ${codes.length === 1 ? "property" : "properties"}?`}
        description="This permanently deletes each matched property from EstateWeb. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        isPending={bulkDelete.isPending}
      />
    </>
  );
}
