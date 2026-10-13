import type { FC } from "react";
import { Button, Modal, type useOverlayState } from "@heroui/react";
import { PropertyClientsSection } from "@/components/property-clients/property-clients-section";

type PropertyClientsModalProps = {
  state: ReturnType<typeof useOverlayState>;
  property: { id: string; title: string } | null;
};

export const PropertyClientsModal: FC<PropertyClientsModalProps> = ({ state, property }) => (
  <Modal state={state}>
    <Modal.Backdrop>
      <Modal.Container>
        <Modal.Dialog className="max-h-[85vh] w-full max-w-2xl">
          <Modal.Header>
            <Modal.Heading className="truncate">{property?.title ?? "Clients"}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="overflow-y-auto">
            {property ? <PropertyClientsSection userPropertyId={property.id} bare /> : null}
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
