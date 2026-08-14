import { useEffect, useState, type FC } from "react";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";

export type BulkInsertionSettingsModalState = ReturnType<typeof useOverlayState>;

export type BulkInsertionSettingsPayload = {
  concurrent_insertions: number;
  insertion_interval_seconds: number;
};

type BulkInsertionSettingsModalProps = {
  state: BulkInsertionSettingsModalState;
  agencyCount: number;
  isLoadingCount?: boolean;
  onConfirm: (payload: BulkInsertionSettingsPayload) => void | Promise<void>;
  isPending?: boolean;
};

export const BulkInsertionSettingsModal: FC<BulkInsertionSettingsModalProps> = ({
  state,
  agencyCount,
  isLoadingCount = false,
  onConfirm,
  isPending = false,
}) => {
  const [concurrentInsertions, setConcurrentInsertions] = useState(1);
  const [insertionIntervalSeconds, setInsertionIntervalSeconds] = useState(1);

  useEffect(() => {
    if (!state.isOpen) return;
    setConcurrentInsertions(1);
    setInsertionIntervalSeconds(1);
  }, [state.isOpen]);

  const isBusy = isPending || isLoadingCount;

  const handleConfirm = async () => {
    const concurrent =
      Number.isFinite(concurrentInsertions) && concurrentInsertions >= 1
        ? concurrentInsertions
        : 1;
    const interval =
      Number.isFinite(insertionIntervalSeconds) && insertionIntervalSeconds >= 0
        ? insertionIntervalSeconds
        : 0;
    try {
      await Promise.resolve(
        onConfirm({
          concurrent_insertions: concurrent,
          insertion_interval_seconds: interval,
        }),
      );
      state.close();
    } catch {
      return;
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isBusy}>
        <Modal.Container>
          <Modal.Dialog className="max-w-md w-full">
            <Modal.Header>
              <Modal.Heading>Bulk insertion settings</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Sets how many properties are pushed to the CMS at once and the
                delay between chunks, for{" "}
                {isLoadingCount
                  ? "all tracked agencies"
                  : `all ${agencyCount} tracked ${agencyCount === 1 ? "agency" : "agencies"}`}
                . This overwrites the existing values on each tracker.
              </p>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-foreground">Concurrent insertions</span>
                <input
                  type="number"
                  min={1}
                  aria-label="Concurrent insertions"
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  value={concurrentInsertions}
                  disabled={isBusy}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    setConcurrentInsertions(
                      Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
                    );
                  }}
                />
                <span className="text-xs text-muted">
                  Number of properties pushed to the CMS in parallel per chunk.
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-foreground">
                  Interval between chunks (seconds)
                </span>
                <input
                  type="number"
                  min={0}
                  aria-label="Insertion interval seconds"
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  value={insertionIntervalSeconds}
                  disabled={isBusy}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    setInsertionIntervalSeconds(
                      Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
                    );
                  }}
                />
                <span className="text-xs text-muted">
                  Delay before pushing the next chunk. 0 for no delay.
                </span>
              </label>
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onPress={() => state.close()}
                isDisabled={isBusy}
              >
                Cancel
              </Button>
              <ActionButtonWithPending
                variant="primary"
                onPress={handleConfirm}
                isPending={isPending}
                isDisabled={isLoadingCount || agencyCount === 0}
              >
                Apply
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
