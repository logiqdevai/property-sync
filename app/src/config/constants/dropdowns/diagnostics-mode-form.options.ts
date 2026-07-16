import {
  DiagnosticsModes,
  type DiagnosticsMode,
} from "@/features/scrapers/interfaces/scrapers.interfaces";

export const DiagnosticsModeFormOptions: { id: DiagnosticsMode; label: string }[] = [
  { id: DiagnosticsModes.PRODUCTION, label: "Production (no tracing)" },
  { id: DiagnosticsModes.TRACE, label: "Trace (Playwright trace on failure)" },
  { id: DiagnosticsModes.FULL_DEBUG, label: "Full debug (trace + video + HAR on failure)" },
];

export function getDiagnosticsModeLabel(mode: DiagnosticsMode | string): string {
  return DiagnosticsModeFormOptions.find((option) => option.id === mode)?.label ?? mode;
}
