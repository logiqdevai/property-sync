import { Chip } from "@heroui/react";
import { getPropertyStatusLabel } from "@/config/constants/dropdowns/properties/property-status-form.options";
import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";

const statusColor: Record<PropertyStatus, "success" | "default" | "warning" | "danger"> = {
  [PropertyStatuses.ACTIVE]: "success",
  [PropertyStatuses.INACTIVE]: "default",
  [PropertyStatuses.REMOVED]: "danger",
  [PropertyStatuses.SOLD]: "warning",
  [PropertyStatuses.RENTED]: "warning",
  [PropertyStatuses.UNKNOWN]: "default",
};

interface PropertyStatusChipProps {
  status: PropertyStatus;
}

export function PropertyStatusChip({ status }: PropertyStatusChipProps) {
  return (
    <Chip color={statusColor[status]} size="sm" variant="soft">
      <Chip.Label>{getPropertyStatusLabel(status)}</Chip.Label>
    </Chip>
  );
}
