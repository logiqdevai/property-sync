import { AppConfig } from "@/config/constants/app-config";
import { RoleGate } from "@/components/providers/role-gate";
import { TrackerAdminOptionsPanel } from "@/components/ui/tracker-admin-options-panel";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import type {
  TrackAgencyPayload,
  TrackableAgency,
  TrackingPrefs,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { TrackedAgencyIntegrationLink } from "@/pages/dashboard/components/tracked-agency-integration-link";
import { Accordion, Button, Modal, useOverlayState } from "@heroui/react";
import { ContentPublishingPanel } from "./content-publishing-panel";

type AgencyPublishingSettingsModalProps = {
  state: ReturnType<typeof useOverlayState>;
  agency: TrackableAgency | null;
  prefs: TrackingPrefs | null | undefined;
  disabled?: boolean;
  onAdminSettingsChange: (payload: TrackAgencyPayload) => void;
};

export function AgencyPublishingSettingsModal({
  state,
  agency,
  prefs,
  disabled = false,
  onAdminSettingsChange,
}: AgencyPublishingSettingsModalProps) {
  if (!agency || !prefs) {
    return null;
  }

  const adminPanel = (
    <TrackerAdminOptionsPanel
      accordionId={`${agency.id}-admin-options`}
      values={{
        concurrent_insertions: prefs.concurrent_insertions ?? 1,
        insertion_interval_seconds: prefs.insertion_interval_seconds ?? 300,
        max_properties: prefs.max_properties ?? null,
        text_truncate_pieces: prefs.text_truncate_pieces ?? [],
      }}
      disabled={disabled}
      onAdminSettingsChange={onAdminSettingsChange}
    />
  );

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!disabled}>
        <Modal.Container>
          <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl">
            <Modal.Header>
              <Modal.Heading>
                Publishing settings · {agency.name}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex max-h-[min(70vh,40rem)] flex-col gap-2 overflow-y-auto">
              {AppConfig.tracked_agency_admin_options_visible ? (
                adminPanel
              ) : (
                <RoleGate roles={[RoleTypes.ADMIN]}>{adminPanel}</RoleGate>
              )}

              <Accordion defaultExpandedKeys={[]} hideSeparator>
                <Accordion.Item id={`${agency.id}-cms-integration`}>
                  <Accordion.Heading>
                    <Accordion.Trigger className="text-sm font-medium text-foreground">
                      CMS integration
                      <Accordion.Indicator />
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <Accordion.Body>
                      <TrackedAgencyIntegrationLink
                        agencyId={agency.id}
                        linkedIntegrationId={prefs.user_integration_id}
                        linkedClientId={prefs.integration_client_id}
                        disabled={disabled}
                        hideHeading
                        className="flex flex-col gap-3 pt-1"
                      />
                    </Accordion.Body>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>

              <Accordion defaultExpandedKeys={[]} hideSeparator>
                <Accordion.Item id={`${agency.id}-content-publishing`}>
                  <Accordion.Heading>
                    <Accordion.Trigger className="text-sm font-medium text-foreground">
                      Content publishing
                      <Accordion.Indicator />
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <Accordion.Body>
                      <div className="pt-1">
                        <ContentPublishingPanel
                          agencyId={agency.id}
                          sourceLanguage={agency.content_language}
                          embedded
                        />
                      </div>
                    </Accordion.Body>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={state.close}>
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
