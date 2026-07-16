import { Chip } from "@heroui/react";
import { DiagnosticsArtifactKinds, type DiagnosticsArtifactKind } from "@/features/diagnostics/interfaces/diagnostics.interfaces";

const kindLabel: Record<DiagnosticsArtifactKind, string> = {
  [DiagnosticsArtifactKinds.TRACE]: "Trace",
  [DiagnosticsArtifactKinds.SCREENSHOT]: "Screenshot",
  [DiagnosticsArtifactKinds.HTML_SNAPSHOT]: "HTML snapshot",
  [DiagnosticsArtifactKinds.CONSOLE_LOG]: "Console log",
  [DiagnosticsArtifactKinds.NETWORK_HAR]: "Network HAR",
  [DiagnosticsArtifactKinds.VIDEO]: "Video",
};

interface ArtifactKindChipProps {
  kind: DiagnosticsArtifactKind;
}

export function ArtifactKindChip({ kind }: ArtifactKindChipProps) {
  return (
    <Chip color="default" size="sm" variant="soft">
      <Chip.Label>{kindLabel[kind]}</Chip.Label>
    </Chip>
  );
}
