import { Chip } from "@heroui/react";
import { GenerationTriggers, type GenerationTrigger } from "../interfaces/scraper-generation.interfaces";

const triggerColor: Record<GenerationTrigger, "default" | "warning"> = {
  [GenerationTriggers.MANUAL]: "default",
  [GenerationTriggers.SELF_HEAL]: "warning",
  [GenerationTriggers.SCHEDULED]: "default",
};

const triggerLabel: Record<GenerationTrigger, string> = {
  [GenerationTriggers.MANUAL]: "Manual",
  [GenerationTriggers.SELF_HEAL]: "Self-heal",
  [GenerationTriggers.SCHEDULED]: "Scheduled",
};

interface GenerationRunTriggerChipProps {
  trigger: GenerationTrigger;
}

export function GenerationRunTriggerChip({ trigger }: GenerationRunTriggerChipProps) {
  return (
    <Chip color={triggerColor[trigger]} size="sm" variant="soft">
      <Chip.Label>{triggerLabel[trigger]}</Chip.Label>
    </Chip>
  );
}
