import {
  getAgencyTrackingColumnDescription,
  getAgencyTrackingColumnLabel,
  type AgencyTrackingColumnId,
} from "@/config/constants/dropdowns/agencies/agency-tracking-column-description.options";
import type {
  TrackableAgency,
  TrackAgencyPayload,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { PrefSwitch } from "./agency-list-card";
import { Tooltip } from "@heroui/react";
import { CircleHelp } from "lucide-react";

export type AgencyTrackingToggleColumnId =
  | "track"
  | "new"
  | "updated"
  | "removed"
  | "auto_crm"
  | "content_changes_only";

export function getAgencyTrackingToggleValue(
  agency: TrackableAgency,
  columnId: AgencyTrackingToggleColumnId,
): boolean {
  const prefs = agency.tracking_prefs;
  if (columnId === "track") return agency.is_tracked;
  if (columnId === "new") return prefs?.track_new_listings ?? false;
  if (columnId === "updated") return prefs?.track_updated_listings ?? false;
  if (columnId === "removed") return prefs?.track_removed_listings ?? false;
  if (columnId === "auto_crm") return prefs?.auto_update_to_crm ?? true;
  return prefs?.cms_update_on_hash_only ?? false;
}

export function getAgencyTrackingTogglePayload(
  columnId: Exclude<AgencyTrackingToggleColumnId, "track">,
  next: boolean,
): TrackAgencyPayload {
  if (columnId === "new") return { track_new_listings: next };
  if (columnId === "updated") return { track_updated_listings: next };
  if (columnId === "removed") return { track_removed_listings: next };
  if (columnId === "auto_crm") return { auto_update_to_crm: next };
  return { cms_update_on_hash_only: next };
}

export function AgencyTrackingColumnHeader({
  columnId,
  toggle,
}: {
  columnId: AgencyTrackingColumnId;
  toggle?: {
    isSelected: boolean;
    isDisabled: boolean;
    onChange: (next: boolean) => void;
  };
}) {
  const label = getAgencyTrackingColumnLabel(columnId);
  const description = getAgencyTrackingColumnDescription(columnId);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="inline-flex items-center gap-1">
        <span>{label}</span>
        <Tooltip delay={300}>
          <Tooltip.Trigger>
            <button
              type="button"
              className="inline-flex shrink-0 text-muted transition-colors hover:text-foreground"
              aria-label={`About ${label}`}
            >
              <CircleHelp className="size-3.5" />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content className="max-w-56 px-2 py-1.5 text-xs leading-snug">
            {description}
          </Tooltip.Content>
        </Tooltip>
      </span>
      {toggle ? (
        <PrefSwitch
          isSelected={toggle.isSelected}
          isDisabled={toggle.isDisabled}
          onChange={toggle.onChange}
          aria-label={`${label} for all rows`}
        />
      ) : null}
    </div>
  );
}
