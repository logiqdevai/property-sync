import { useState } from "react";
import { Button, Chip, CloseButton, Label, Modal, useOverlayState } from "@heroui/react";
import { TruncateMatchField } from "@/components/ui/truncate-match-field";
import { encodeTruncatePiece, parseTruncatePiece, type TruncatePieceMode } from "@/lib/truncate-pieces";

export type TruncateRulesModalState = ReturnType<typeof useOverlayState>;

interface TruncateRulesModalProps {
  state: TruncateRulesModalState;
  rules: string[];
  disabled?: boolean;
  onChange: (rules: string[]) => void;
}

const RULE_MODE_LABELS: Record<TruncatePieceMode, string> = {
  text: "Exact text",
  pattern: "Pattern",
};

export function TruncateRulesModal({
  state,
  rules,
  disabled = false,
  onChange,
}: TruncateRulesModalProps) {
  const [draftMode, setDraftMode] = useState<TruncatePieceMode>("text");
  const [draftValue, setDraftValue] = useState("");

  const trimmedDraft = draftValue.trim();

  const addRule = () => {
    if (!trimmedDraft) return;
    const encoded = encodeTruncatePiece(draftMode, trimmedDraft);
    if (rules.includes(encoded)) {
      setDraftValue("");
      return;
    }
    onChange([...rules, encoded]);
    setDraftValue("");
  };

  const removeRule = (rule: string) => {
    onChange(rules.filter((item) => item !== rule));
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="max-w-2xl">
            <Modal.Header>
              <Modal.Heading>Text truncate rules</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted">
                  Removed from title and description before the user property is created.
                  Matching ignores extra spaces and line breaks.
                </p>

                {rules.length > 0 ? (
                  <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                    {rules.map((rule) => {
                      const { mode, value } = parseTruncatePiece(rule);
                      return (
                        <div
                          key={rule}
                          className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2"
                        >
                          <div className="flex min-w-0 flex-col gap-1">
                            <Chip size="sm" variant="soft" className="self-start">
                              {RULE_MODE_LABELS[mode]}
                            </Chip>
                            <span className="whitespace-pre-wrap text-sm text-foreground">
                              {value}
                            </span>
                          </div>
                          <CloseButton
                            isDisabled={disabled}
                            onPress={() => removeRule(rule)}
                            aria-label={`Remove rule ${value}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No truncate rules yet.</p>
                )}

                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <Label>Add a rule</Label>
                  <TruncateMatchField
                    idPrefix="truncate-rule-draft"
                    mode={draftMode}
                    onModeChange={setDraftMode}
                    value={draftValue}
                    onChange={setDraftValue}
                    disabled={disabled}
                    textLabel="Text to remove"
                    patternLabel="Pattern to remove"
                    tabsAriaLabel="Rule type"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="self-end"
                    isDisabled={disabled || !trimmedDraft}
                    onPress={addRule}
                  >
                    Add rule
                  </Button>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="primary" onPress={state.close}>
                Done
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
