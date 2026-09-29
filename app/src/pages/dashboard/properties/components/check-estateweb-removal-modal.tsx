import type { FC } from "react";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import type { CheckEstateWebRemovalResult } from "@/features/user-properties/interfaces/user-properties.interfaces";

export type CheckEstateWebRemovalModalState = ReturnType<typeof useOverlayState>;

type CheckEstateWebRemovalModalProps = {
  state: CheckEstateWebRemovalModalState;
  result?: CheckEstateWebRemovalResult;
  isPending?: boolean;
  onFix: (ids: string[]) => void | Promise<void>;
  isFixPending?: boolean;
};

export const CheckEstateWebRemovalModal: FC<CheckEstateWebRemovalModalProps> = ({
  state,
  result,
  isPending = false,
  onFix,
  isFixPending = false,
}) => {
  const stillLiveIds = result?.still_live_ids ?? [];
  const copyValue = stillLiveIds.join(", ");

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isFixPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-lg w-full">
            <Modal.Header>
              <Modal.Heading>Check EstateWeb removal sync</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              {isPending || !result ? (
                <p className="text-sm text-muted">
                  Checking each property's live state on EstateWeb…
                </p>
              ) : (
                <>
                  <p className="text-sm text-foreground">
                    Checked {result.checked} of {result.total} selected
                    {result.checked === 1 ? " property" : " properties"}{" "}
                    (REMOVED/SOLD and linked to EstateWeb).{" "}
                    <span className="font-medium">
                      {result.still_live_count} still live
                    </span>{" "}
                    on EstateWeb.
                  </p>

                  {result.still_live_count > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted uppercase">
                          User property IDs still live
                        </span>
                        <CopyIconButton
                          value={copyValue}
                          ariaLabel="Copy still-live user property IDs"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-secondary px-3 py-2">
                        <code className="text-xs whitespace-pre-wrap break-all">
                          {copyValue}
                        </code>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Nothing to fix — every checked property is already
                      correctly unpublished on EstateWeb.
                    </p>
                  )}

                  {result.errors.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted uppercase">
                        Could not check ({result.errors.length})
                      </span>
                      <div className="max-h-32 overflow-y-auto rounded-lg border border-border px-3 py-2 flex flex-col gap-1">
                        {result.errors.map((row) => (
                          <p
                            key={row.user_property_id}
                            className="text-xs text-muted"
                          >
                            {row.user_property_id}: {row.error}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onPress={() => state.close()}
                isDisabled={isFixPending}
              >
                Close
              </Button>
              <ActionButtonWithPending
                variant="primary"
                isPending={isFixPending}
                isDisabled={!result || result.still_live_count === 0}
                onPress={() => onFix(stillLiveIds)}
              >
                Unlink from sites ({result?.still_live_count ?? 0})
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
