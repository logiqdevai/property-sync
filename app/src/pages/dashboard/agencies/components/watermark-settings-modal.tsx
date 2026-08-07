import type { TrackAgencyPayload } from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { Button, Modal, Tabs, useOverlayState } from "@heroui/react";

const WatermarkModes = {
  AUTOMATIC: "automatic",
  MANUAL: "manual",
} as const;

type WatermarkMode = (typeof WatermarkModes)[keyof typeof WatermarkModes];

type WatermarkSettingsModalProps = {
  state: ReturnType<typeof useOverlayState>;
  agencyId: string;
  agencyName: string;
  disabled?: boolean;
  watermarkManualSelection: boolean;
  watermarkImageCount: number;
  onSave: (payload: TrackAgencyPayload) => void;
};

export function WatermarkSettingsModal({
  state,
  agencyId,
  agencyName,
  disabled = false,
  watermarkManualSelection,
  watermarkImageCount,
  onSave,
}: WatermarkSettingsModalProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!disabled}>
        <Modal.Container>
          <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-lg">
            <Modal.Header>
              <Modal.Heading>Watermark settings</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-xs text-muted">
                Configure how watermarks are handled for {agencyName}. When off
                at the row toggle, listings publish with EstateWeb default sites
                and no watermark removal.
              </p>
              <Tabs
                className="w-full min-w-0 max-w-full"
                variant="secondary"
                selectedKey={
                  watermarkManualSelection
                    ? WatermarkModes.MANUAL
                    : WatermarkModes.AUTOMATIC
                }
                onSelectionChange={(key) => {
                  const nextMode = key as WatermarkMode;
                  const nextManual = nextMode === WatermarkModes.MANUAL;
                  if (nextManual === watermarkManualSelection) {
                    return;
                  }
                  onSave({ watermark_manual_selection: nextManual });
                }}
              >
                <Tabs.ListContainer className="min-w-0 max-w-full">
                  <Tabs.List
                    aria-label="Watermark removal mode"
                    className="max-w-full min-w-0 [&_[data-slot=tabs-tab]]:!w-auto [&_[data-slot=tabs-tab]]:min-w-0 [&_[data-slot=tabs-tab]]:flex-1"
                  >
                    <Tabs.Tab
                      id={WatermarkModes.AUTOMATIC}
                      isDisabled={disabled}
                    >
                      Automatic
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id={WatermarkModes.MANUAL} isDisabled={disabled}>
                      Manual selection
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id={WatermarkModes.AUTOMATIC} className="pt-3">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted">
                      Remove watermarks from the first N images after crawl and
                      normalization. Only cleaned versions upload to EstateWeb.
                      Remaining images stay as-is. Listing publishes to your
                      EstateWeb default sites.
                    </p>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-foreground">
                        Images to dewatermark
                      </span>
                      <input
                        type="number"
                        min={1}
                        className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2"
                        defaultValue={watermarkImageCount}
                        key={`watermark-count-${agencyId}-${watermarkImageCount}`}
                        disabled={disabled}
                        onBlur={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          const value =
                            Number.isFinite(parsed) && parsed >= 1
                              ? parsed
                              : 1;
                          if (value !== watermarkImageCount) {
                            onSave({ watermark_image_count: value });
                          }
                        }}
                      />
                    </label>
                  </div>
                </Tabs.Panel>

                <Tabs.Panel id={WatermarkModes.MANUAL} className="pt-3">
                  <p className="text-xs text-muted">
                    No automatic watermark removal. Listing is created in
                    EstateWeb CRM with no sites selected, so it is not
                    published. Handle images manually, then publish when ready.
                  </p>
                </Tabs.Panel>
              </Tabs>
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
}
