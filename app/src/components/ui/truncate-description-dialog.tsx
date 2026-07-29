import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button, Chip, Label, Modal, TextArea, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { TruncateMatchField } from "@/components/ui/truncate-match-field";
import { cn } from "@/lib/utils";
import {
  encodeTruncatePiece,
  parseTruncatePiece,
  type TruncatePieceMode,
} from "@/lib/truncate-pieces";

export type TruncateDescriptionDialogState = ReturnType<typeof useOverlayState>;

export type TruncateDescriptionConfirmPayload = {
  texts: string[];
  replacement?: string;
};

export type TruncateDescriptionDialogProps = {
  state: TruncateDescriptionDialogState;
  propertyCount: number;
  onConfirm: (payload: TruncateDescriptionConfirmPayload) => void | Promise<void>;
  isPending?: boolean;
  storedRules?: string[];
};

const RULE_MODE_LABELS: Record<TruncatePieceMode, string> = {
  text: "Exact text",
  pattern: "Pattern",
};

export function TruncateDescriptionDialog({
  state,
  propertyCount,
  onConfirm,
  isPending = false,
  storedRules = [],
}: TruncateDescriptionDialogProps) {
  const [mode, setMode] = useState<TruncatePieceMode>("text");
  const [text, setText] = useState("");
  const [replacement, setReplacement] = useState("");
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!state.isOpen) {
      setMode("text");
      setText("");
      setReplacement("");
      setSelectedRules(new Set());
    }
  }, [state.isOpen]);

  const trimmed = text.trim();
  const trimmedReplacement = replacement.trim();
  const countLabel =
    propertyCount === 1 ? "1 property" : `${propertyCount} properties`;
  const allRulesSelected =
    storedRules.length > 0 && selectedRules.size === storedRules.length;

  const toggleRule = (rule: string, isSelected: boolean) => {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (isSelected) {
        next.add(rule);
      } else {
        next.delete(rule);
      }
      return next;
    });
  };

  const toggleSelectAllRules = () => {
    setSelectedRules(allRulesSelected ? new Set() : new Set(storedRules));
  };

  const piecesToApply = [
    ...selectedRules,
    ...(trimmed ? [encodeTruncatePiece(mode, trimmed)] : []),
  ];

  const handleConfirm = async () => {
    if (piecesToApply.length === 0) return;
    try {
      await Promise.resolve(
        onConfirm({
          texts: piecesToApply,
          ...(trimmedReplacement ? { replacement: trimmedReplacement } : {}),
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
          <Modal.Dialog className="max-w-2xl">
            <Modal.Header>
              <Modal.Heading>Truncate description text</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  Remove matching text from title and description on {countLabel}. Pick one or
                  more previously used rules, add a new one, or both. Leave replacement empty to
                  remove, or enter text to replace it.
                </p>

                {storedRules.length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Stored rules for this agency</Label>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        isDisabled={isPending}
                        onPress={toggleSelectAllRules}
                      >
                        {allRulesSelected ? "Deselect all" : "Select all"}
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {storedRules.map((rule) => {
                        const { mode: ruleMode, value } = parseTruncatePiece(rule);
                        const isSelected = selectedRules.has(rule);
                        return (
                          <div
                            key={rule}
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={`Apply rule ${value}`}
                            tabIndex={isPending ? -1 : 0}
                            onClick={() => {
                              if (!isPending) toggleRule(rule, !isSelected);
                            }}
                            onKeyDown={(e) => {
                              if (isPending) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleRule(rule, !isSelected);
                              }
                            }}
                            className={cn(
                              "flex items-start justify-between gap-3 rounded-lg border px-3 py-2",
                              isPending ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                              isSelected
                                ? "border-accent bg-accent/10"
                                : "border-border",
                            )}
                          >
                            <div className="flex min-w-0 flex-col gap-1">
                              <Chip size="sm" variant="soft" className="self-start">
                                {RULE_MODE_LABELS[ruleMode]}
                              </Chip>
                              <span className="whitespace-pre-wrap text-sm text-foreground">
                                {value}
                              </span>
                            </div>
                            <div
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-md border",
                                isSelected
                                  ? "border-transparent bg-accent text-accent-foreground"
                                  : "border-border bg-field",
                              )}
                            >
                              {isSelected ? <Check className="size-3" /> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <TruncateMatchField
                  idPrefix="truncate-description"
                  mode={mode}
                  onModeChange={setMode}
                  value={text}
                  onChange={setText}
                  disabled={isPending}
                  textLabel="Add a new rule (optional)"
                  rows={5}
                />

                <div className="flex flex-col gap-1">
                  <Label htmlFor="truncate-description-replacement">
                    Replacement text{" "}
                    <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <TextArea
                    id="truncate-description-replacement"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                    rows={3}
                    fullWidth
                    placeholder="Leave empty to remove, or type replacement…"
                    disabled={isPending}
                  />
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" isDisabled={isPending} onPress={state.close}>
                Cancel
              </Button>
              <ActionButtonWithPending
                variant="primary"
                isPending={isPending}
                isDisabled={isPending || piecesToApply.length === 0}
                onPress={handleConfirm}
              >
                Apply
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
