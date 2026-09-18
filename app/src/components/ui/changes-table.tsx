import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChangesTableRow {
  path: string;
  from?: unknown;
  to?: unknown;
  /** The value changed but is sensitive, so neither side is available. */
  redacted?: boolean;
}

interface ChangesTableProps {
  changes: ChangesTableRow[];
  /** Full snapshots; when provided a "Raw JSON" toggle shows them side by side. */
  before?: unknown;
  after?: unknown;
  className?: string;
}

const COLLAPSE_AT = 120;

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function ValueCell({ value, tone }: { value: unknown; tone: "from" | "to" }) {
  const [expanded, setExpanded] = useState(false);

  if (value === null || value === undefined || value === "") {
    return <span className="text-muted">—</span>;
  }

  const text = stringify(value);
  const collapsible = text.length > COLLAPSE_AT;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className={cn(
          "whitespace-pre-wrap break-words font-mono",
          tone === "from" ? "text-danger" : "text-success",
        )}
      >
        {collapsible && !expanded ? `${text.slice(0, COLLAPSE_AT)}…` : text}
      </span>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="w-fit rounded-md px-1 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
        >
          {expanded ? "Show less" : `Show all (${text.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  );
}

function RawJson({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-surface-secondary p-2.5 text-xs text-muted whitespace-pre-wrap break-words font-mono leading-relaxed">
        {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** Field-level before/after diff, with an optional raw snapshot view. */
export function ChangesTable({ changes, before, after, className }: ChangesTableProps) {
  const [showRaw, setShowRaw] = useState(false);
  const hasSnapshots = before !== undefined || after !== undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {changes.length === 0 ? (
        <p className="text-xs text-muted">No field values changed.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-secondary text-muted">
              <tr>
                <th className="w-1/4 px-3 py-2 font-medium">Field</th>
                <th className="w-[37.5%] px-3 py-2 font-medium">Before</th>
                <th className="w-[37.5%] px-3 py-2 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.path} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-mono text-foreground break-all">{change.path}</td>
                  {change.redacted ? (
                    <td colSpan={2} className="px-3 py-2 text-muted">
                      Changed — value hidden (sensitive field)
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <ValueCell value={change.from} tone="from" />
                      </td>
                      <td className="px-3 py-2">
                        <ValueCell value={change.to} tone="to" />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasSnapshots && (
        <>
          <button
            type="button"
            onClick={() => setShowRaw((current) => !current)}
            className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
            aria-expanded={showRaw}
          >
            {showRaw ? "Hide raw JSON" : "Show raw JSON"}
            <ChevronDown className={cn("size-3.5 transition-transform", showRaw && "rotate-180")} />
          </button>
          {showRaw && (
            <div className="grid gap-3 md:grid-cols-2">
              <RawJson label="Before" value={before} />
              <RawJson label="After" value={after} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
