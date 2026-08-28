import type { ReactNode } from "react";
import type {
  TrackAgencyPayload,
  TrackableAgency,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import {
  useTrackAgency,
  useUpdateAgencyTracking,
} from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { Button, Switch } from "@heroui/react";
import { ExternalLink, Settings } from "lucide-react";

function PrefSwitch({
  isSelected,
  isDisabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  isSelected: boolean;
  isDisabled: boolean;
  onChange: (next: boolean) => void;
  "aria-label": string;
}) {
  return (
    <Switch
      isSelected={isSelected}
      isDisabled={isDisabled}
      onChange={onChange}
      aria-label={ariaLabel}
    >
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
    </Switch>
  );
}

function PrefRow({
  label,
  isSelected,
  isDisabled,
  onChange,
  trailing,
}: {
  label: string;
  isSelected: boolean;
  isDisabled: boolean;
  onChange: (next: boolean) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-sm text-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <PrefSwitch
          isSelected={isSelected}
          isDisabled={isDisabled}
          onChange={onChange}
          aria-label={label}
        />
        {trailing}
      </div>
    </div>
  );
}

export function useAgencyTrackingControls(
  agency: TrackableAgency,
  onUntrackRequest: (agency: TrackableAgency) => void,
) {
  const trackAgency = useTrackAgency();
  const updateTracking = useUpdateAgencyTracking();
  const prefs = agency.tracking_prefs;
  const isAgencyDisabled = !agency.is_enabled;
  const isPending = trackAgency.isPending || updateTracking.isPending;
  const isControlsDisabled = isAgencyDisabled || isPending;
  const prefsDisabled = isControlsDisabled || !agency.is_tracked || !prefs;

  const savePrefs = (payload: TrackAgencyPayload) => {
    if (!agency.is_tracked || isAgencyDisabled) return;
    updateTracking.mutate({ agencyId: agency.id, payload });
  };

  const handleTrackToggle = (next: boolean) => {
    if (isAgencyDisabled) return;
    if (next) {
      trackAgency.mutate({
        agencyId: agency.id,
        payload: {},
      });
      return;
    }
    onUntrackRequest(agency);
  };

  const cityCountry = [agency.city, agency.country].filter(Boolean).join(", ");
  const location = cityCountry || agency.base_url;
  const locationTitle = cityCountry ? undefined : agency.base_url;

  return {
    prefs,
    location,
    locationTitle,
    isAgencyDisabled,
    isControlsDisabled,
    prefsDisabled,
    savePrefs,
    handleTrackToggle,
  };
}

type AgencyListCardProps = {
  agency: TrackableAgency;
  rowNumber: number;
  onUntrackRequest: (agency: TrackableAgency) => void;
  onOpenWatermarkSettings: (agency: TrackableAgency) => void;
  onOpenPublishingSettings: (agency: TrackableAgency) => void;
};

export function AgencyListCard({
  agency,
  rowNumber,
  onUntrackRequest,
  onOpenWatermarkSettings,
  onOpenPublishingSettings,
}: AgencyListCardProps) {
  const {
    prefs,
    location,
    locationTitle,
    isAgencyDisabled,
    isControlsDisabled,
    prefsDisabled,
    savePrefs,
    handleTrackToggle,
  } = useAgencyTrackingControls(agency, onUntrackRequest);

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 w-6 shrink-0 text-sm tabular-nums text-muted">
            {rowNumber}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="truncate text-base font-semibold text-foreground">
                {agency.name}
              </h2>
              <a
                href={agency.base_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-muted hover:text-accent"
                aria-label={`Open ${agency.name} website`}
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
            <p
              className="min-w-0 truncate text-xs text-muted"
              title={locationTitle}
            >
              {location}
            </p>
            {isAgencyDisabled ? (
              <p className="mt-1 text-xs text-muted">Unavailable</p>
            ) : null}
          </div>
        </div>
        <PrefSwitch
          isSelected={agency.is_tracked}
          isDisabled={isControlsDisabled}
          onChange={handleTrackToggle}
          aria-label={agency.is_tracked ? "Tracking" : "Track"}
        />
      </div>

      {agency.is_tracked && prefs ? (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <PrefRow
            label="New listings"
            isSelected={prefs.track_new_listings}
            isDisabled={prefsDisabled}
            onChange={(isSelected) =>
              savePrefs({ track_new_listings: isSelected })
            }
          />
          <PrefRow
            label="Updated listings"
            isSelected={prefs.track_updated_listings}
            isDisabled={prefsDisabled}
            onChange={(isSelected) =>
              savePrefs({ track_updated_listings: isSelected })
            }
          />
          <PrefRow
            label="Removed listings"
            isSelected={prefs.track_removed_listings}
            isDisabled={prefsDisabled}
            onChange={(isSelected) =>
              savePrefs({ track_removed_listings: isSelected })
            }
          />
          <PrefRow
            label="Auto CRM"
            isSelected={prefs.auto_update_to_crm ?? true}
            isDisabled={prefsDisabled}
            onChange={(isSelected) =>
              savePrefs({ auto_update_to_crm: isSelected })
            }
          />
          <PrefRow
            label="Content changes only"
            isSelected={prefs.cms_update_on_hash_only ?? false}
            isDisabled={prefsDisabled}
            onChange={(isSelected) =>
              savePrefs({ cms_update_on_hash_only: isSelected })
            }
          />
          <PrefRow
            label="Watermark"
            isSelected={prefs.remove_watermark ?? false}
            isDisabled={prefsDisabled}
            onChange={(isSelected) =>
              savePrefs({
                remove_watermark: isSelected,
                ...(isSelected ? {} : { watermark_manual_selection: false }),
              })
            }
            trailing={
              prefs.remove_watermark ? (
                <Button
                  size="sm"
                  variant="secondary"
                  isIconOnly
                  isDisabled={prefsDisabled}
                  aria-label="Watermark settings"
                  onPress={() => onOpenWatermarkSettings(agency)}
                >
                  <Settings className="size-3.5" />
                </Button>
              ) : null
            }
          />
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            isDisabled={prefsDisabled}
            onPress={() => onOpenPublishingSettings(agency)}
          >
            Publishing settings
          </Button>
        </div>
      ) : !isAgencyDisabled ? (
        <p className="border-t border-border pt-3 text-xs text-muted">
          Turn on Track to choose which listing changes you want to follow.
        </p>
      ) : null}
    </article>
  );
}

export { PrefSwitch };
