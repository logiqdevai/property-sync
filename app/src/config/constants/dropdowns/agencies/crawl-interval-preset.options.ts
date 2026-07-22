export const CrawlIntervalPresetOptions: { id: string; label: string }[] = [
  { id: "0 * * * *", label: "Every hour" },
  { id: "0 */2 * * *", label: "Every 2 hours" },
  { id: "0 */3 * * *", label: "Every 3 hours" },
  { id: "0 */4 * * *", label: "Every 4 hours" },
  { id: "0 */6 * * *", label: "Every 6 hours" },
  { id: "0 */8 * * *", label: "Every 8 hours" },
  { id: "0 */12 * * *", label: "Every 12 hours" },
  { id: "0 0 * * *", label: "Once a day at midnight (Athens)" },
  { id: "0 6 * * *", label: "Once a day at 06:00 (Athens)" },
  { id: "0 9 * * *", label: "Once a day at 09:00 (Athens)" },
  { id: "0 12 * * *", label: "Once a day at noon (Athens)" },
  { id: "0 18 * * *", label: "Once a day at 18:00 (Athens)" },
  { id: "0 0 * * 1", label: "Weekly on Monday at midnight (Athens)" },
  { id: "0 9 * * 1-5", label: "Weekdays at 09:00 (Athens)" },
];

export function getCrawlIntervalPresetLabel(cron: string): string {
  return CrawlIntervalPresetOptions.find((option) => option.id === cron)?.label ?? cron;
}

export function isCrawlIntervalPreset(cron: string): boolean {
  return CrawlIntervalPresetOptions.some((option) => option.id === cron);
}
