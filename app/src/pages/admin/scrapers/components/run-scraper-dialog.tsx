import { useState } from "react";
import { Modal, Switch, Button, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";

export type RunScraperDialogState = ReturnType<typeof useOverlayState>;

export type RunScraperDialogProps = {
  state: RunScraperDialogState;
  scraperName: string;
  isPending?: boolean;
  onConfirm: (options: { skip_spike_check: boolean }) => unknown;
};

export function RunScraperDialog({ state, scraperName, isPending = false, onConfirm }: RunScraperDialogProps) {
  const [skipSpikeCheck, setSkipSpikeCheck] = useState(false);

  const handleConfirm = async () => {
    try {
      await Promise.resolve(onConfirm({ skip_spike_check: skipSpikeCheck }));
      state.close();
      setSkipSpikeCheck(false);
    } catch {
      return;
    }
  };

  return (
    <Modal
      state={state}
      onOpenChange={(isOpen) => {
        if (!isOpen) setSkipSpikeCheck(false);
      }}
    >
      <Modal.Backdrop isDismissable={!isPending}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Run {scraperName} now?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  This triggers an immediate crawl for this scraper, outside its normal schedule.
                </p>
                <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                  <Switch isSelected={skipSpikeCheck} isDisabled={isPending} onChange={setSkipSpikeCheck}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>Skip spike-removal protection for this run</Switch.Content>
                  </Switch>
                  <span className="text-xs text-muted">
                    Lets every listing missing from this crawl be marked removed even if that's an
                    unusually large drop, and suppresses the removal-spike notification. Only enable
                    this when the drop is confirmed legitimate (e.g. the agency did a real listings
                    cleanup) — otherwise leave it off so the usual safety check applies.
                  </span>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" isDisabled={isPending} onPress={state.close}>
                Cancel
              </Button>
              <ActionButtonWithPending isPending={isPending} isDisabled={isPending} onPress={handleConfirm}>
                Run now
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
