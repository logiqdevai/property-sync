import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListBox, Modal, Select, Skeleton, TextArea, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { EstateWebPushSitesList } from "@/components/ui/estateweb-push-sites-list";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { Routes } from "@/routes/routes";
import type { EstateWebPushSiteSetting } from "@/features/estateweb/interfaces/estateweb-integration-settings.interfaces";
import type { EstateWebBulkSitesByCodesJobResult } from "@/features/estateweb/interfaces/estateweb.interfaces";
import {
  useAvailableIntegrationTargets,
  useUserIntegrationSettings,
} from "@/features/user-integrations/hooks/use-user-integrations";
import {
  useBulkUpdateEstateWebPropertySites,
  useEstateWebAdminIntegrations,
} from "@/features/estateweb/hooks/use-estateweb";
import { useJob } from "@/features/jobs/hooks/use-jobs";

export type EstateWebOrphanSitesModalState = ReturnType<typeof useOverlayState>;

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
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>(NONE_SELECTED);
  const [codesInput, setCodesInput] = useState("");
  const [sites, setSites] = useState<EstateWebPushSiteSetting[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [jobLogId, setJobLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setSelectedIntegrationId(NONE_SELECTED);
      setCodesInput("");
      setSites([]);
      setHydrated(false);
      setJobLogId(null);
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
  const settingsTargetId = state.isOpen && hasIntegration ? estateWebTarget?.id : undefined;
  const { data: settings, isPending: settingsPending } =
    useUserIntegrationSettings(settingsTargetId);

  useEffect(() => {
    if (!state.isOpen || !hasIntegration) {
      setHydrated(false);
      return;
    }
    if (hydrated) return;
    if (!settingsTargetId || settingsPending || settings === undefined) return;

    setSites((settings.settings?.estateweb_default_sites ?? []).map((site) => ({ ...site })));
    setHydrated(true);
  }, [state.isOpen, hasIntegration, settings, settingsPending, settingsTargetId, hydrated]);

  const bulkUpdateSites = useBulkUpdateEstateWebPropertySites();
  const { data: job } = useJob(jobLogId ?? "");
  const jobResult = job?.result as EstateWebBulkSitesByCodesJobResult | undefined;
  const jobIsActive = !!job && ACTIVE_JOB_STATUSES.has(job.status);

  const isLoadingSites =
    hasIntegration &&
    !hydrated &&
    (targetsPending || !settingsTargetId || settingsPending || settings === undefined);

  const codes = parseCodes(codesInput);

  const handleApply = () => {
    if (codes.length === 0 || !hasIntegration) return;
    bulkUpdateSites.mutate(
      {
        userIntegrationId: selectedIntegrationId,
        codes,
        sites: sites.filter((site) => site.selected),
      },
      { onSuccess: (result) => setJobLogId(result.job_log_id) },
    );
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!jobIsActive}>
        <Modal.Container>
          <Modal.Dialog className="max-w-2xl w-full">
            <Modal.Header>
              <Modal.Heading>Manage EstateWeb sites by code</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
                <p className="text-sm text-muted">
                  Pick an EstateWeb connection, paste in the property "code" values you want to
                  manage (one per line, or comma/space separated), then choose which sites those
                  properties should be published to. Useful for disabling the sites of orphaned
                  duplicate EstateWeb properties that have no matching record in our system. Runs
                  in the background since this can touch hundreds of properties.
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

                {hasIntegration && !jobLogId ? (
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

                {jobLogId ? (
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
                    {jobResult ? (
                      <>
                        <p className="text-sm text-muted">
                          {jobResult.processed} of {jobResult.total} processed —{" "}
                          {jobResult.updated} updated, {jobResult.failed} failed
                        </p>
                        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                          {jobResult.items.map((item) => (
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
                  onPress={handleApply}
                  isPending={bulkUpdateSites.isPending}
                  isDisabled={!hasIntegration || codes.length === 0 || isLoadingSites}
                >
                  Apply to {codes.length} code{codes.length === 1 ? "" : "s"}
                </ActionButtonWithPending>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
