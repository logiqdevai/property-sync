export interface CronOccurrences {
  /** Hours 0-23 this schedule can fire at (minute granularity is collapsed). */
  hours: number[];
  /** Weekdays 0-6 this schedule can fire on (cron convention: 0 = Sunday). */
  weekdays: number[];
}

function expandCronField(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const match = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!match) return null;

    const [, base, stepRaw] = match;
    const step = stepRaw ? Number(stepRaw) : 1;
    if (step <= 0) return null;

    let start = min;
    let end = max;
    if (base !== "*") {
      if (base.includes("-")) {
        const [a, b] = base.split("-").map(Number);
        if (Number.isNaN(a) || Number.isNaN(b) || a > b) return null;
        start = a;
        end = b;
      } else {
        start = end = Number(base);
      }
    }
    if (start < min || end > max) return null;

    for (let value = start; value <= end; value += step) values.add(value);
  }

  return values.size > 0 ? [...values].sort((a, b) => a - b) : null;
}

/**
 * Best-effort read of a 5-field cron's hour + day-of-week reach, at hour
 * granularity (the minute field is ignored -- every crawl_interval in this app
 * fires on a fixed minute). Returns null for anything the schedule grid can't
 * represent: not 5 fields, or an hour/day-of-week field outside cron's own
 * `*`, list, range, step grammar.
 */
export function parseCronOccurrences(cron: string): CronOccurrences | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [, hourField, , , dayOfWeekField] = parts;
  const hours = expandCronField(hourField, 0, 23);
  const rawWeekdays = expandCronField(dayOfWeekField, 0, 7);
  if (!hours || !rawWeekdays) return null;

  // Cron accepts both 0 and 7 for Sunday.
  const weekdays = [...new Set(rawWeekdays.map((day) => (day === 7 ? 0 : day)))].sort(
    (a, b) => a - b,
  );

  return { hours, weekdays };
}
