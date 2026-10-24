import type {
  TrackAgencyPayload,
  TrackableAgency,
  TrackingPrefs,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { AgencyPublishingSettingsContent } from "./agency-publishing-settings-content";

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
              <AgencyPublishingSettingsContent
                agency={agency}
                prefs={prefs}
                disabled={disabled}
                onAdminSettingsChange={onAdminSettingsChange}
              />
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
