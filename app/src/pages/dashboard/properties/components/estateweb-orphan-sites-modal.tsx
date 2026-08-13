import { useEffect, useState } from "react";
import { ListBox, Modal, Select, Skeleton, TextArea, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { EstateWebPushSitesList } from "@/components/ui/estateweb-push-sites-list";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import type { EstateWebPushSiteSetting } from "@/features/estateweb/interfaces/estateweb-integration-settings.interfaces";
import type { EstateWebBulkSitesUpdateResult } from "@/features/estateweb/interfaces/estateweb.interfaces";
import {
  useAvailableIntegrationTargets,
  useUserIntegrationSettings,
} from "@/features/user-integrations/hooks/use-user-integrations";
import {
  useBulkUpdateEstateWebPropertySites,
  useEstateWebAdminIntegrations,
} from "@/features/estateweb/hooks/use-estateweb";

export type EstateWebOrphanSitesModalState = ReturnType<typeof useOverlayState>;

const NONE_SELECTED = "";

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
  const [results, setResults] = useState<EstateWebBulkSitesUpdateResult[] | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setSelectedIntegrationId(NONE_SELECTED);
      setCodesInput("");
      setSites([]);
      setHydrated(false);
      setResults(null);
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

  const isLoadingSites =
    hasIntegration &&
    !hydrated &&
    (targetsPending || !settingsTargetId || settingsPending || settings === undefined);

  const codes = parseCodes(codesInput);

  const handleApply = () => {
    if (codes.length === 0 || !hasIntegration) return;
    setResults(null);
    bulkUpdateSites.mutate(
      {
        userIntegrationId: selectedIntegrationId,
        codes,
        sites: sites.filter((site) => site.selected),
      },
      { onSuccess: setResults },
    );
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!bulkUpdateSites.isPending}>
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
                  duplicate EstateWeb properties that have no matching record in our system.
                </p>

                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">EstateWeb connection</span>
                  <Select
                    aria-label="Select EstateWeb integration"
                    selectedKey={selectedIntegrationId}
                    onSelectionChange={(key) => setSelectedIntegrationId(String(key))}
                    isDisabled={integrationsPending || bulkUpdateSites.isPending}
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

                {hasIntegration ? (
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
                      disabled={bulkUpdateSites.isPending}
                    />
                  </div>
                ) : null}

                {hasIntegration ? (
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
                        isDisabled={bulkUpdateSites.isPending}
                        emptyLabel="No EstateWeb sites configured. Add them in Integrations → EstateWeb CMS Configuration."
                      />
                    )}
                  </div>
                ) : null}

                {results ? (
                  <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
                    <span className="text-sm font-medium text-foreground">Results</span>
                    {results.map((result) => (
                      <div
                        key={result.code}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="font-mono text-foreground">{result.code}</span>
                        <span className={result.success ? "text-success" : "text-danger"}>
                          {result.success ? "Updated" : result.error || "Failed"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <ActionButtonWithPending
                type="button"
                variant="secondary"
                onPress={() => state.close()}
                isDisabled={bulkUpdateSites.isPending}
              >
                Close
              </ActionButtonWithPending>
              <ActionButtonWithPending
                type="button"
                onPress={handleApply}
                isPending={bulkUpdateSites.isPending}
                isDisabled={!hasIntegration || codes.length === 0 || isLoadingSites}
              >
                Apply to {codes.length} code{codes.length === 1 ? "" : "s"}
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
