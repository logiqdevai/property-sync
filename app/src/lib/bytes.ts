const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? size : size.toFixed(2)} ${UNITS[unit]}`;
}
