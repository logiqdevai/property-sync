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
  [AttentionReasons.BROKEN]: { label: "Scraper broken", color: "danger", icon: Wrench },
};

export function AgencyAttentionChip({
  reason,
  scraperStatus,
}: {
  reason: AttentionReason | null;
  scraperStatus: string;
}) {
  if (!reason) return <StatusChip label="Updating normally" color="success" icon={CheckCircle2} />;
  const { label: reasonLabel, color, icon } = reasons[reason];
  // A broken scraper shows its actual status instead of a vague hint.
  const label = reason === AttentionReasons.BROKEN ? `Scraper status: ${scraperStatus}` : reasonLabel;
  return <StatusChip label={label} color={color} icon={icon} />;
}
