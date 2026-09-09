export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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

export function toStartOfDayIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

export function toEndOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// Local (viewer's own clock) day helpers — used wherever "day" pagination or
// a day boundary needs to line up with the viewer's calendar, not UTC.
export function toLocalIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function getTodayIso() {
  return toLocalIsoDate(new Date());
}

export function parseIsoDateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function shiftIsoDate(date: string, deltaDays: number) {
  const { y, m, d } = parseIsoDateParts(date);
  return toLocalIsoDate(new Date(y, m - 1, d + deltaDays));
}

export function getLocalDayRangeIso(date: string) {
  const { y, m, d } = parseIsoDateParts(date);
  return {
    from: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
    to: new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString(),
  };
}
