import { useEffect, useState, type FC } from "react";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { cn } from "@/lib/utils";
import type { MigrateIntegrationImagesMode } from "@/features/user-properties/interfaces/user-properties.interfaces";

export type MigrateIntegrationImagesModalState = ReturnType<
  typeof useOverlayState
>;

type MigrateIntegrationImagesModalProps = {
  state: MigrateIntegrationImagesModalState;
  onConfirm: (mode: MigrateIntegrationImagesMode) => void | Promise<void>;
  isPending?: boolean;
  propertyCount?: number;
};

const MODE_OPTIONS: {
  value: MigrateIntegrationImagesMode;
  label: string;
  description: string;
}[] = [
  {
    value: "from_crm",
    label: "Refresh from CRM only",
    description:
      "Pull current EstateWeb images and replace stored integration images. Does not remap old source URLs.",
  },
  {
    value: "remap_sources",
    label: "Migrate with source remapping",
    description:
      "Pull EstateWeb images and remap source_image from property images / existing stored sources (previous behavior).",
  },
];

export const MigrateIntegrationImagesModal: FC<
  MigrateIntegrationImagesModalProps
> = ({ state, onConfirm, isPending = false, propertyCount }) => {
  const [mode, setMode] = useState<MigrateIntegrationImagesMode>("from_crm");

  useEffect(() => {
    if (!state.isOpen) return;
    setMode("from_crm");
  }, [state.isOpen]);

  const handleConfirm = async () => {
    try {
      await Promise.resolve(onConfirm(mode));
      state.close();
    } catch {
      return;
    }
  };

  const intro =
    propertyCount != null && propertyCount > 1
      ? `Choose how EstateWeb images should be written into IntegrationProperty for ${propertyCount} linked properties.`
      : "Choose how EstateWeb images should be written into IntegrationProperty.";

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-md w-full">
            <Modal.Header>
              <Modal.Heading>Migrate CRM images</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-sm text-muted">{intro}</p>
              <div className="flex flex-col gap-2">
                {MODE_OPTIONS.map((option) => {
                  const selected = mode === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer transition-colors",
                        selected
                          ? "border-accent/50 bg-accent/10"
                          : "hover:bg-surface-secondary",
                        isPending && "opacity-60 pointer-events-none",
                      )}
                    >
                      <input
                        type="radio"
                        className="mt-1 size-4"
                        name="migrate-integration-images-mode"
                        checked={selected}
                        disabled={isPending}
                        onChange={() => setMode(option.value)}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm text-foreground">
                          {option.label}
                        </span>
                        <span className="text-xs text-muted">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onPress={() => state.close()}
                isDisabled={isPending}
              >
                Cancel
              </Button>
              <ActionButtonWithPending
                variant="primary"
                onPress={handleConfirm}
                isPending={isPending}
              >
                Migrate
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
