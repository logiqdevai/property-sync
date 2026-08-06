import { Accordion, Button, useOverlayState } from "@heroui/react";
import { TruncateRulesModal } from "@/components/ui/truncate-rules-modal";
import type { UpdateTrackerAdminSettingsPayload } from "@/features/agencies/interfaces/agencies.interfaces";

export interface TrackerAdminOptionsValues {
  concurrent_insertions: number;
  insertion_interval_seconds: number;
  max_properties: number | null;
  text_truncate_pieces: string[];
}

interface TrackerAdminOptionsPanelProps {
  values: TrackerAdminOptionsValues;
  disabled?: boolean;
  accordionId?: string;
  onAdminSettingsChange: (payload: UpdateTrackerAdminSettingsPayload) => void;
}

export function TrackerAdminOptionsPanel({
  values,
  disabled = false,
  accordionId = "admin-options",
  onAdminSettingsChange,
}: TrackerAdminOptionsPanelProps) {
  const pieces = values.text_truncate_pieces ?? [];
  const rulesModalState = useOverlayState();

  return (
    <>
      <Accordion defaultExpandedKeys={[]} hideSeparator>
      <Accordion.Item id={accordionId}>
        <Accordion.Heading>
          <Accordion.Trigger className="text-sm font-medium text-foreground">
            Admin options
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            <div
              className="flex flex-col gap-3 pt-1"
              key={`${accordionId}-${values.concurrent_insertions}-${values.insertion_interval_seconds}-${values.max_properties ?? "unlimited"}-${pieces.join("\0")}`}
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Maximum properties</span>
                <span className="text-xs text-muted">
                  Cap how many listings are inserted into the CRM. Leave empty for no limit.
                </span>
                <input
                  type="number"
                  min={1}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  defaultValue={values.max_properties ?? ""}
                  disabled={disabled}
                  placeholder="Unlimited"
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") {
                      if (values.max_properties != null) {
                        onAdminSettingsChange({ max_properties: null });
                      }
                      return;
                    }
                    const value = Number.parseInt(raw, 10);
                    if (
                      Number.isFinite(value) &&
                      value >= 1 &&
                      value !== values.max_properties
                    ) {
                      onAdminSettingsChange({ max_properties: value });
                    }
                  }}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Concurrent insertions</span>
                <input
                  type="number"
                  min={1}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  defaultValue={values.concurrent_insertions ?? 1}
                  disabled={disabled}
                  onBlur={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    if (
                      Number.isFinite(value) &&
                      value >= 1 &&
                      value !== values.concurrent_insertions
                    ) {
                      onAdminSettingsChange({ concurrent_insertions: value });
                    }
                  }}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Insertion interval (seconds)</span>
                <input
                  type="number"
                  min={0}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  defaultValue={values.insertion_interval_seconds ?? 300}
                  disabled={disabled}
                  onBlur={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    if (
                      Number.isFinite(value) &&
                      value >= 0 &&
                      value !== values.insertion_interval_seconds
                    ) {
                      onAdminSettingsChange({ insertion_interval_seconds: value });
                    }
                  }}
                />
              </label>

              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-foreground">Text truncate rules</span>
                  <span className="text-xs text-muted">
                    {pieces.length > 0
                      ? `${pieces.length} rule${pieces.length === 1 ? "" : "s"} configured`
                      : "No rules configured"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={disabled}
                  onPress={rulesModalState.open}
                >
                  Manage rules
                </Button>
              </div>
            </div>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
      </Accordion>
      <TruncateRulesModal
        state={rulesModalState}
        rules={pieces}
        disabled={disabled}
        onChange={(next) => onAdminSettingsChange({ text_truncate_pieces: next })}
      />
    </>
  );
}
