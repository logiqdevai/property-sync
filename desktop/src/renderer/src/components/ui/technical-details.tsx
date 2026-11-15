interface TechnicalDetailsProps {
  lines: string[];
  label?: string;
}

/** Collapsed log lines for support; the people using the app never need to open it. */
export function TechnicalDetails({ lines, label = "Technical details" }: TechnicalDetailsProps) {
  if (lines.length === 0) return null;
  return (
    <details className="group rounded-lg border border-border">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted hover:text-foreground">
        {label}
      </summary>
      <pre className="max-h-64 overflow-auto border-t border-border bg-surface-secondary p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-muted">
        {lines.join("\n")}
      </pre>
    </details>
  );
}
