import { useEffect, useState, type FC } from "react";
import { Button, ListBox, Modal, Select, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { PropertyStatusFormOptions } from "@/config/constants/dropdowns/properties/property-status-form.options";
import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";

export type ChangePropertyStatusModalState = ReturnType<typeof useOverlayState>;

type ChangePropertyStatusModalProps = {
  state: ChangePropertyStatusModalState;
  propertyCount: number;
  onConfirm: (status: PropertyStatus) => void | Promise<void>;
  isPending?: boolean;
};

export const ChangePropertyStatusModal: FC<ChangePropertyStatusModalProps> = ({
  state,
  propertyCount,
  onConfirm,
  isPending = false,
}) => {
  const [status, setStatus] = useState<PropertyStatus>(PropertyStatuses.ACTIVE);

  useEffect(() => {
    if (!state.isOpen) return;
    setStatus(PropertyStatuses.ACTIVE);
  }, [state.isOpen]);

  const handleConfirm = async () => {
    try {
      await Promise.resolve(onConfirm(status));
      state.close();
    } catch {
      return;
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-md w-full">
            <Modal.Header>
              <Modal.Heading>
                Change status
                {propertyCount > 1 ? ` (${propertyCount})` : ""}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Set a new status for the selected
                {propertyCount > 1 ? " properties" : " property"}. Update runs in
                the background.
              </p>
              <Select
                aria-label="Property status"
                selectedKey={status}
                onSelectionChange={(key) => {
                  if (key == null) return;
                  setStatus(String(key) as PropertyStatus);
                }}
                isDisabled={isPending}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox items={PropertyStatusFormOptions}>
                    {(option) => (
                      <ListBox.Item id={option.id} textValue={option.label}>
                        {option.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    )}
                  </ListBox>
                </Select.Popover>
              </Select>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={state.close} isDisabled={isPending}>
                Cancel
              </Button>
              <ActionButtonWithPending
                variant="primary"
                onPress={() => void handleConfirm()}
                isPending={isPending}
                isDisabled={isPending}
              >
                Update status
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
