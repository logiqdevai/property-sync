import { Chip } from "@heroui/react";
import { GenerationTriggerFilterOptions } from "@/config/constants/dropdowns/scrapers/generation-trigger-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { GenerationTriggers, type GenerationTrigger } from "@/features/scraper-generation/interfaces/scraper-generation.interfaces";

const triggerColor: Record<GenerationTrigger, "default" | "warning"> = {
  [GenerationTriggers.MANUAL]: "default",
  [GenerationTriggers.SELF_HEAL]: "warning",
  [GenerationTriggers.SCHEDULED]: "default",
};

interface GenerationRunTriggerChipProps {
  trigger: GenerationTrigger;
}

export function GenerationRunTriggerChip({ trigger }: GenerationRunTriggerChipProps) {
  return (
    <Chip color={triggerColor[trigger]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(GenerationTriggerFilterOptions, trigger)}</Chip.Label>
    </Chip>
  );
}
