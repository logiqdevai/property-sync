import { PropertyHistoryChangeLabel } from "@/components/ui/property-history-change-label";
import type { UserDashboardActivityItem } from "@/features/user-dashboard/interfaces/user-dashboard.interfaces";

type ActivityChangeLabelProps = {
  entry: Pick<
    UserDashboardActivityItem,
    "event_type" | "field" | "old_value" | "new_value"
  >;
};

export function ActivityChangeLabel({ entry }: ActivityChangeLabelProps) {
  return <PropertyHistoryChangeLabel entry={entry} className="text-muted" />;
}
