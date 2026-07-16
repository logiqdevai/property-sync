import { Link } from "react-router-dom";
import { Accordion, Switch } from "@heroui/react";
import { CrawlIntervalField } from "@/components/ui/crawl-interval-field";
import type { UpdateTrackerAdminSettingsPayload } from "@/features/agencies/interfaces/agencies.interfaces";
import type { TrackAgencyPayload } from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { Routes } from "@/routes/routes";

export interface TrackerAdminOptionsValues {
  use_ai_batching: boolean;
  crawl_interval: string;
  concurrent_insertions: number;
  insertion_interval_minutes: number;
}

interface TrackerAdminOptionsPanelProps {
  values: TrackerAdminOptionsValues;
  disabled?: boolean;
  accordionId?: string;
  showIntegrationsHint?: boolean;
  onPrefsChange: (payload: TrackAgencyPayload) => void;
  onAdminSettingsChange: (payload: UpdateTrackerAdminSettingsPayload) => void;
}

export function TrackerAdminOptionsPanel({
  values,
  disabled = false,
  accordionId = "admin-options",
  showIntegrationsHint = true,
  onPrefsChange,
  onAdminSettingsChange,
}: TrackerAdminOptionsPanelProps) {
  return (
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
              key={`${accordionId}-${values.crawl_interval}-${values.concurrent_insertions}-${values.insertion_interval_minutes}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-foreground">Use AI batching</span>
                  <span className="text-xs text-muted">
                    Lower cost, slower updates on scheduled crawls.
                  </span>
                </div>
                <Switch
                  isSelected={values.use_ai_batching}
                  isDisabled={disabled}
                  onChange={(isSelected) => onPrefsChange({ use_ai_batching: isSelected })}
                  aria-label="Use AI batching"
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              </div>

              <CrawlIntervalField
                value={values.crawl_interval ?? ""}
                disabled={disabled}
                onChange={(crawl_interval) => onAdminSettingsChange({ crawl_interval })}
              />

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
                <span className="text-muted">Insertion interval (minutes)</span>
                <input
                  type="number"
                  min={1}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  defaultValue={values.insertion_interval_minutes ?? 5}
                  disabled={disabled}
                  onBlur={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    if (
                      Number.isFinite(value) &&
                      value >= 1 &&
                      value !== values.insertion_interval_minutes
                    ) {
                      onAdminSettingsChange({ insertion_interval_minutes: value });
                    }
                  }}
                />
              </label>

              {showIntegrationsHint ? (
                <p className="text-xs text-muted">
                  Batching applies on scheduled crawls when batching is enabled. Connect your AI
                  key on{" "}
                  <Link
                    to={Routes.dashboard.integrations}
                    className="text-accent hover:underline"
                  >
                    Integrations
                  </Link>{" "}
                  before tracking.
                </p>
              ) : null}
            </div>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
