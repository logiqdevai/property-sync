import { AlertTriangle, Ban, CheckCircle2, SearchX, Wrench } from "lucide-react";
import { StatusChip, type StatusChipColor } from "@/components/ui/status-chip";
import {
  AttentionReasons,
  type AttentionReason,
} from "@/features/desktop-crawl/interfaces/desktop-crawl.interfaces";

const reasons: Record<AttentionReason, { label: string; color: StatusChipColor; icon: typeof Ban }> = {
  [AttentionReasons.BLOCKED]: { label: "Website blocks automatic updates", color: "danger", icon: Ban },
  [AttentionReasons.FAILED]: { label: "Last automatic update failed", color: "warning", icon: AlertTriangle },
  [AttentionReasons.EMPTY]: { label: "Last automatic update found nothing", color: "warning", icon: SearchX },
  [AttentionReasons.BROKEN]: { label: "Needs a developer", color: "danger", icon: Wrench },
};

export function AgencyAttentionChip({ reason }: { reason: AttentionReason | null }) {
  if (!reason) return <StatusChip label="Updating normally" color="success" icon={CheckCircle2} />;
  const { label, color, icon } = reasons[reason];
  return <StatusChip label={label} color={color} icon={icon} />;
}
