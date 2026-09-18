import { Chip } from "@heroui/react";
import {
  ActivityChangeOperations,
  ActivityOutcomes,
  type ActivityChangeOperation,
  type ActivityOutcome,
} from "@/features/activity-logs/interfaces/activity-logs.interfaces";

const outcomeColor: Record<ActivityOutcome, "success" | "danger"> = {
  [ActivityOutcomes.SUCCESS]: "success",
  [ActivityOutcomes.FAILURE]: "danger",
};

interface ActivityOutcomeChipProps {
  outcome: ActivityOutcome;
  statusCode?: number | null;
}

export function ActivityOutcomeChip({ outcome, statusCode }: ActivityOutcomeChipProps) {
  const label = outcome === ActivityOutcomes.SUCCESS ? "Success" : "Failed";
  return (
    <Chip color={outcomeColor[outcome]} size="sm" variant="soft">
      <Chip.Label>{statusCode ? `${label} · ${statusCode}` : label}</Chip.Label>
    </Chip>
  );
}

const operationColor: Record<ActivityChangeOperation, "success" | "accent" | "danger" | "default"> = {
  [ActivityChangeOperations.CREATE]: "success",
  [ActivityChangeOperations.UPDATE]: "accent",
  [ActivityChangeOperations.DELETE]: "danger",
  [ActivityChangeOperations.ACTION]: "default",
};

export function ActivityOperationChip({ operation }: { operation: ActivityChangeOperation }) {
  return (
    <Chip color={operationColor[operation]} size="sm" variant="soft">
      <Chip.Label>{operation.charAt(0) + operation.slice(1).toLowerCase()}</Chip.Label>
    </Chip>
  );
}

export function ImpersonatedChip() {
  return (
    <Chip color="warning" size="sm" variant="soft">
      <Chip.Label>Impersonating</Chip.Label>
    </Chip>
  );
}
