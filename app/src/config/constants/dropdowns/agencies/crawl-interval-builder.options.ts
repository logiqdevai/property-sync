export const CrawlIntervalBuilderFrequencies = {
  HOURLY: "hourly",
  DAILY: "daily",
  WEEKLY: "weekly",
} as const;

export type CrawlIntervalBuilderFrequency =
  (typeof CrawlIntervalBuilderFrequencies)[keyof typeof CrawlIntervalBuilderFrequencies];

export const CrawlIntervalBuilderFrequencyOptions: {
  id: CrawlIntervalBuilderFrequency;
  label: string;
}[] = [
  { id: CrawlIntervalBuilderFrequencies.HOURLY, label: "Every few hours" },
  { id: CrawlIntervalBuilderFrequencies.DAILY, label: "Once a day" },
  { id: CrawlIntervalBuilderFrequencies.WEEKLY, label: "Once a week" },
];

export const CrawlIntervalBuilderHourlyIntervalOptions: { id: string; label: string }[] = [
  { id: "1", label: "Every hour" },
  { id: "2", label: "Every 2 hours" },
  { id: "3", label: "Every 3 hours" },
  { id: "4", label: "Every 4 hours" },
  { id: "6", label: "Every 6 hours" },
  { id: "8", label: "Every 8 hours" },
  { id: "12", label: "Every 12 hours" },
];

export const CrawlIntervalBuilderHourOptions: { id: string; label: string }[] = Array.from(
  { length: 24 },
  (_, hour) => ({
    id: String(hour),
    label: `${String(hour).padStart(2, "0")}:00`,
  }),
);

export const CrawlIntervalBuilderWeekdayOptions: { id: string; label: string }[] = [
  { id: "1", label: "Monday" },
  { id: "2", label: "Tuesday" },
  { id: "3", label: "Wednesday" },
  { id: "4", label: "Thursday" },
  { id: "5", label: "Friday" },
  { id: "6", label: "Saturday" },
  { id: "0", label: "Sunday" },
];

export interface CrawlIntervalBuilderState {
  frequency: CrawlIntervalBuilderFrequency;
  hourlyInterval: string;
  hour: string;
  weekday: string;
  /** HOURLY/DAILY only. Weekday ids from CrawlIntervalBuilderWeekdayOptions; [] means every day. */
  days: string[];
}

export const DefaultCrawlIntervalBuilderState: CrawlIntervalBuilderState = {
  frequency: CrawlIntervalBuilderFrequencies.HOURLY,
  hourlyInterval: "6",
  hour: "9",
  weekday: "1",
  days: [],
};

function formatDaysField(days: string[]): string {
  if (days.length === 0) return "*";
  return [...days].sort((a, b) => Number(a) - Number(b)).join(",");
}

function parseDaysField(dayOfWeek: string): string[] | null {
  if (dayOfWeek === "*") return [];

  const parts = dayOfWeek.split(",");
  const seen = new Set<string>();
  for (const part of parts) {
    if (seen.has(part)) return null;
    if (!CrawlIntervalBuilderWeekdayOptions.some((option) => option.id === part)) return null;
    seen.add(part);
  }

  return parts.slice().sort((a, b) => Number(a) - Number(b));
}

export function buildCrawlIntervalCron(state: CrawlIntervalBuilderState): string {
  if (state.frequency === CrawlIntervalBuilderFrequencies.HOURLY) {
    const interval = state.hourlyInterval === "1" ? "*" : `*/${state.hourlyInterval}`;
    return `0 ${interval} * * ${formatDaysField(state.days)}`;
  }

  if (state.frequency === CrawlIntervalBuilderFrequencies.DAILY) {
    return `0 ${state.hour} * * ${formatDaysField(state.days)}`;
  }

  return `0 ${state.hour} * * ${state.weekday}`;
}

export function parseCrawlIntervalBuilderState(
  cron: string,
): CrawlIntervalBuilderState | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (minute !== "0" || dayOfMonth !== "*" || month !== "*") return null;

  // A single specific weekday paired with a specific hour is shape-ambiguous with
  // "Daily restricted to that one day" — Weekly wins the tie so previously-saved
  // Weekly crons keep round-tripping into the Weekly tab unchanged.
  if (
    dayOfWeek !== "*" &&
    !dayOfWeek.includes(",") &&
    /^\d+$/.test(hour) &&
    Number(hour) >= 0 &&
    Number(hour) <= 23 &&
    CrawlIntervalBuilderWeekdayOptions.some((option) => option.id === dayOfWeek)
  ) {
    return {
      ...DefaultCrawlIntervalBuilderState,
      frequency: CrawlIntervalBuilderFrequencies.WEEKLY,
      hour,
      weekday: dayOfWeek,
    };
  }

  const days = parseDaysField(dayOfWeek);
  if (days === null) return null;

  if (hour === "*") {
    return {
      ...DefaultCrawlIntervalBuilderState,
      frequency: CrawlIntervalBuilderFrequencies.HOURLY,
      hourlyInterval: "1",
      days,
    };
  }

  const everyMatch = hour.match(/^\*\/(\d+)$/);
  if (everyMatch) {
    const interval = everyMatch[1];
    if (CrawlIntervalBuilderHourlyIntervalOptions.some((option) => option.id === interval)) {
      return {
        ...DefaultCrawlIntervalBuilderState,
        frequency: CrawlIntervalBuilderFrequencies.HOURLY,
        hourlyInterval: interval,
        days,
      };
    }
    return null;
  }

  if (/^\d+$/.test(hour) && Number(hour) >= 0 && Number(hour) <= 23) {
    return {
      ...DefaultCrawlIntervalBuilderState,
      frequency: CrawlIntervalBuilderFrequencies.DAILY,
      hour,
      days,
    };
  }

  return null;
}
