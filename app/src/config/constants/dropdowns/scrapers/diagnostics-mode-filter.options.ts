import {
  DiagnosticsModes,
  type DiagnosticsMode,
} from "@/features/scrapers/interfaces/scrapers.interfaces";

export const DiagnosticsModeFilterOptions: { id: DiagnosticsMode | "all"; label: string }[] = [
  { id: "all", label: "All modes" },
  { id: DiagnosticsModes.PRODUCTION, label: "Production" },
  { id: DiagnosticsModes.TRACE, label: "Trace" },
  { id: DiagnosticsModes.FULL_DEBUG, label: "Full debug" },
];
