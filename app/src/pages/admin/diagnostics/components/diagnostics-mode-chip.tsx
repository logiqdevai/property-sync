import { Chip } from "@heroui/react";
import { DiagnosticsModeFilterOptions } from "@/config/constants/dropdowns/scrapers/diagnostics-mode-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import {
  DiagnosticsModes,
  type DiagnosticsMode,
} from "@/features/scrapers/interfaces/scrapers.interfaces";

const modeColor: Record<DiagnosticsMode, "success" | "default" | "warning" | "danger"> = {
  [DiagnosticsModes.PRODUCTION]: "default",
  [DiagnosticsModes.TRACE]: "warning",
  [DiagnosticsModes.FULL_DEBUG]: "danger",
};

interface DiagnosticsModeChipProps {
  mode: DiagnosticsMode;
}

export function DiagnosticsModeChip({ mode }: DiagnosticsModeChipProps) {
  return (
    <Chip color={modeColor[mode]} size="sm" variant="soft">
      <Chip.Label>{getDropdownOptionLabel(DiagnosticsModeFilterOptions, mode)}</Chip.Label>
    </Chip>
  );
}
