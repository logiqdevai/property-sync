import { DateTime } from "luxon";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3 hours ago", "yesterday"… in the viewer's language. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "never";
  return DateTime.fromISO(value).toRelative() ?? formatDateTime(value);
}

/** Elapsed time since `from`, e.g. "12 min" or "1 h 05 min". */
export function formatElapsed(from: string | null | undefined, now = Date.now()): string {
  if (!from) return "—";
  const minutes = Math.max(0, Math.floor((now - Date.parse(from)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
