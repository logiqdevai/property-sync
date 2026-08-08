import {
  getAgencyTrackingColumnDescription,
  getAgencyTrackingColumnLabel,
  type AgencyTrackingColumnId,
} from "@/config/constants/dropdowns/agencies/agency-tracking-column-description.options";
import { Tooltip } from "@heroui/react";
import { CircleHelp } from "lucide-react";

export function AgencyTrackingColumnHeader({
  columnId,
}: {
  columnId: AgencyTrackingColumnId;
}) {
  const label = getAgencyTrackingColumnLabel(columnId);
  const description = getAgencyTrackingColumnDescription(columnId);

  return (
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
  );
}
