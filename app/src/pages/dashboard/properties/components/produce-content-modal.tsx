import { useEffect, useState, type FC } from "react";
import { Button, Checkbox, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { cn } from "@/lib/utils";

export type ProduceContentModalState = ReturnType<typeof useOverlayState>;

type ProduceContentModalProps = {
  state: ProduceContentModalState;
  propertyCount: number;
  onConfirm: (payload: {
    runTranslations: boolean;
    runAiTitles: boolean;
    useAiBatch: boolean;
    regenerate: boolean;
    pushToCrm: boolean;
  }) => void | Promise<void>;
  isPending?: boolean;
};

export const ProduceContentModal: FC<ProduceContentModalProps> = ({
  state,
  propertyCount,
  onConfirm,
  isPending = false,
}) => {
  const [runTranslations, setRunTranslations] = useState(true);
  const [runAiTitles, setRunAiTitles] = useState(true);
  const [useAiBatch, setUseAiBatch] = useState(false);
  const [regenerate, setRegenerate] = useState(true);
  const [pushToCrm, setPushToCrm] = useState(true);

  useEffect(() => {
    if (!state.isOpen) return;
    setRunTranslations(true);
    setRunAiTitles(true);
    setUseAiBatch(false);
    setRegenerate(true);
    setPushToCrm(true);
  }, [state.isOpen]);

  const canSubmit = runTranslations || runAiTitles;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    try {
      await Promise.resolve(
        onConfirm({
          runTranslations,
          runAiTitles,
          useAiBatch: runAiTitles ? useAiBatch : false,
          regenerate,
          pushToCrm,
        }),
      );
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
                Produce content
                {propertyCount > 1 ? ` (${propertyCount})` : ""}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Run translations and/or AI titles for the selected
                {propertyCount > 1 ? " properties" : " property"} in the
                background (up to 5 in parallel). Track progress in Job queue.
              </p>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer transition-colors",
                  runTranslations
                    ? "border-accent/50 bg-accent/10"
                    : "hover:bg-surface-secondary",
                  isPending && "opacity-60 pointer-events-none",
                )}
              >
                <Checkbox
                  aria-label="Run translations"
                  isSelected={runTranslations}
                  onChange={setRunTranslations}
                  isDisabled={isPending}
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">Translations</span>
                  <span className="text-xs text-muted">
                    Google Translate for TRANSLATE description/title slots.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer transition-colors",
                  runAiTitles
                    ? "border-accent/50 bg-accent/10"
                    : "hover:bg-surface-secondary",
                  isPending && "opacity-60 pointer-events-none",
                )}
              >
                <Checkbox
                  aria-label="Run AI titles"
                  isSelected={runAiTitles}
                  onChange={setRunAiTitles}
                  isDisabled={isPending}
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">AI titles</span>
                  <span className="text-xs text-muted">
                    Generate titles for each enabled AI title family.
                  </span>
                </span>
              </label>
              {runAiTitles ? (
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer transition-colors ml-4",
                    useAiBatch
                      ? "border-accent/50 bg-accent/10"
                      : "hover:bg-surface-secondary",
                    isPending && "opacity-60 pointer-events-none",
                  )}
                >
                  <Checkbox
                    aria-label="Use OpenAI Batch API"
                    isSelected={useAiBatch}
                    onChange={setUseAiBatch}
                    isDisabled={isPending}
                  >
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm text-foreground">
                      Use OpenAI Batch
                    </span>
                    <span className="text-xs text-muted">
                      Cheaper, async. Off = sync multi-property chat (faster
                      results).
                    </span>
                  </span>
                </label>
              ) : null}
              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer transition-colors",
                  regenerate
                    ? "border-accent/50 bg-accent/10"
                    : "hover:bg-surface-secondary",
                  isPending && "opacity-60 pointer-events-none",
                )}
              >
                <Checkbox
                  aria-label="Regenerate existing content"
                  isSelected={regenerate}
                  onChange={setRegenerate}
                  isDisabled={isPending}
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">Regenerate</span>
                  <span className="text-xs text-muted">
                    Mark existing localized content stale and recreate missing
                    or stale slots.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer transition-colors",
                  pushToCrm
                    ? "border-accent/50 bg-accent/10"
                    : "hover:bg-surface-secondary",
                  isPending && "opacity-60 pointer-events-none",
                )}
              >
                <Checkbox
                  aria-label="Push language ads to EstateWeb CRM"
                  isSelected={pushToCrm}
                  onChange={setPushToCrm}
                  isDisabled={isPending}
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    Push to EstateWeb CRM
                  </span>
                  <span className="text-xs text-muted">
                    After production, push language titles and descriptions to
                    EstateWeb (runs in the background job).
                  </span>
                </span>
              </label>
              {!canSubmit ? (
                <p className="text-xs text-danger">
                  Select translations and/or AI titles.
                </p>
              ) : null}
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
                isDisabled={!canSubmit}
              >
                Produce
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
