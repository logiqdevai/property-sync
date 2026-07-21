import { Label, Tabs, TextArea } from "@heroui/react";
import { buildPatternPreview, type TruncatePieceMode } from "@/lib/truncate-pieces";

interface TruncateMatchFieldProps {
  idPrefix: string;
  mode: TruncatePieceMode;
  onModeChange: (mode: TruncatePieceMode) => void;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  textLabel?: string;
  patternLabel?: string;
  tabsAriaLabel?: string;
}

export function TruncateMatchField({
  idPrefix,
  mode,
  onModeChange,
  value,
  onChange,
  disabled = false,
  rows = 4,
  textLabel = "Text to find",
  patternLabel = "Pattern to find",
  tabsAriaLabel = "Match type",
}: TruncateMatchFieldProps) {
  const preview = mode === "pattern" ? buildPatternPreview(value.trim()) : "";

  return (
    <Tabs
      variant="secondary"
      selectedKey={mode}
      onSelectionChange={(key) => onModeChange(key as TruncatePieceMode)}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={tabsAriaLabel}>
          <Tabs.Tab id="text" isDisabled={disabled}>
            Exact text
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="pattern" isDisabled={disabled}>
            Pattern
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel id="text" className="pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-text`}>{textLabel}</Label>
          <TextArea
            id={`${idPrefix}-text`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            fullWidth
            placeholder="Paste the exact phrase or block to find…"
            disabled={disabled}
          />
        </div>
      </Tabs.Panel>

      <Tabs.Panel id="pattern" className="pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-pattern`}>{patternLabel}</Label>
          <p className="text-xs text-muted">
            Use <span className="font-mono">*</span> for any text and{" "}
            <span className="font-mono">#</span> for a number (e.g. 1-2773). Everything else is
            matched exactly.
          </p>
          <TextArea
            id={`${idPrefix}-pattern`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            fullWidth
            placeholder="e.g. Κωδικός ακινήτου: # -"
            disabled={disabled}
          />
          {preview ? (
            <p className="text-xs text-muted">
              Matches: <span className="text-foreground">{preview}</span>
            </p>
          ) : null}
        </div>
      </Tabs.Panel>
    </Tabs>
  );
}
