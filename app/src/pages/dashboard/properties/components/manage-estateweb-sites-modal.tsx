import { useEffect, useState, type FC } from "react";
import { Modal, Skeleton, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { EstateWebPushSitesList } from "@/components/ui/estateweb-push-sites-list";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import type { EstateWebPushSiteSetting } from "@/features/estateweb/interfaces/estateweb-integration-settings.interfaces";
import {
  useAvailableIntegrationTargets,
  useUserIntegrationSettings,
} from "@/features/user-integrations/hooks/use-user-integrations";
import { useUpdateUserPropertyEstateWebSites } from "@/features/user-properties/hooks/use-user-properties";

export type ManageEstateWebSitesModalState = ReturnType<typeof useOverlayState>;

type ManageEstateWebSitesModalProps = {
  state: ManageEstateWebSitesModalState;
  propertyIds: string[];
};

export const ManageEstateWebSitesModal: FC<ManageEstateWebSitesModalProps> = ({
  state,
  propertyIds,
}) => {
  const { data: targets = [], isPending: targetsPending } =
    useAvailableIntegrationTargets();
  const estateWebTarget = targets.find(
    (target) => target.integration_type === IntegrationTypes.ESTATEWEB,
  );
  const settingsTargetId = state.isOpen ? estateWebTarget?.id : undefined;
  const { data: settings, isPending: settingsPending } =
    useUserIntegrationSettings(settingsTargetId);
  const updateSites = useUpdateUserPropertyEstateWebSites();

  const [sites, setSites] = useState<EstateWebPushSiteSetting[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!state.isOpen) {
      setHydrated(false);
      return;
    }

    if (hydrated) return;
    if (!settingsTargetId || settingsPending || settings === undefined) return;

    setSites(
      (settings.settings?.estateweb_default_sites ?? []).map((site) => ({
        ...site,
      })),
    );
    setHydrated(true);
  }, [state.isOpen, settings, settingsPending, settingsTargetId, hydrated]);

  const isLoading = state.isOpen && !hydrated && (targetsPending || settingsPending || !settingsTargetId || settings === undefined);

  const handleConfirm = () => {
    if (propertyIds.length === 0) return;

    updateSites.mutate(
      {
        ids: propertyIds,
        sites: sites.filter((site) => site.selected),
      },
      { onSuccess: () => state.close() },
    );
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!updateSites.isPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-xl w-full">
            <Modal.Header>
              <Modal.Heading>Manage EstateWeb Sites</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
                <p className="text-sm text-muted">
                  Choose which EstateWeb sites{" "}
                  {propertyIds.length === 1
                    ? "this property"
                    : `these ${propertyIds.length} properties`}{" "}
                  should be published to. Unselected sites are omitted from the CRM update.
                </p>

                {isLoading ? (
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-24 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !estateWebTarget ? (
                  <p className="text-sm text-muted py-4 text-center">
                    No EstateWeb integration configured.
                  </p>
                ) : (
                  <EstateWebPushSitesList
                    sites={sites}
                    onChange={setSites}
                    mode="select"
                    isDisabled={updateSites.isPending}
                    emptyLabel="No EstateWeb sites configured. Add them in Integrations → EstateWeb CMS Configuration."
                  />
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <ActionButtonWithPending
                type="button"
                variant="secondary"
                onPress={() => state.close()}
                isDisabled={updateSites.isPending}
              >
                Cancel
              </ActionButtonWithPending>
              <ActionButtonWithPending
                type="button"
                onPress={handleConfirm}
                isPending={updateSites.isPending}
                isDisabled={isLoading || !estateWebTarget || propertyIds.length === 0}
              >
                Update Sites
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
