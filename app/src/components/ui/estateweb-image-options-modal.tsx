import { useEffect, useState, type FC } from "react";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { cn } from "@/lib/utils";

export type EstateWebImageOptionsModalState = ReturnType<typeof useOverlayState>;

export type EstateWebImageOptions = {
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
};

type EstateWebImageOptionsModalProps = {
  state: EstateWebImageOptionsModalState;
  selectedCount: number;
  initialOptions: EstateWebImageOptions;
  onConfirm: (options: EstateWebImageOptions) => void | Promise<void>;
  isPending?: boolean;
};

const OPTION_FIELDS: {
  key: keyof EstateWebImageOptions;
  label: string;
}[] = [
  { key: "show_on_site", label: "Show on site" },
  { key: "show_on_groups", label: "Show on groups" },
  { key: "show_on_foreign_agents", label: "Show on foreign agents" },
];

export const EstateWebImageOptionsModal: FC<EstateWebImageOptionsModalProps> = ({
  state,
  selectedCount,
  initialOptions,
  onConfirm,
  isPending = false,
}) => {
  const [options, setOptions] = useState<EstateWebImageOptions>(initialOptions);

  useEffect(() => {
    if (!state.isOpen) return;
    setOptions(initialOptions);
  }, [state.isOpen]);

  const handleConfirm = async () => {
    try {
      await Promise.resolve(onConfirm(options));
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
                EstateWeb image options
                {selectedCount > 0 ? ` (${selectedCount})` : ""}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                Choose where selected CRM images should appear.
              </p>
              <div className="flex flex-col gap-2">
                {OPTION_FIELDS.map((field) => {
                  const checked = options[field.key];
                  return (
                    <label
                      key={field.key}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer transition-colors",
                        checked
                          ? "border-accent/50 bg-accent/10"
                          : "hover:bg-surface-secondary",
                        isPending && "opacity-60 pointer-events-none",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={checked}
                        disabled={isPending}
                        onChange={(event) =>
                          setOptions((current) => ({
                            ...current,
                            [field.key]: event.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm text-foreground">{field.label}</span>
                    </label>
                  );
                })}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                isDisabled={isPending}
                onPress={state.close}
              >
                Cancel
              </Button>
              <ActionButtonWithPending
                variant="primary"
                isPending={isPending}
                isDisabled={isPending}
                onPress={handleConfirm}
              >
                Update
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
