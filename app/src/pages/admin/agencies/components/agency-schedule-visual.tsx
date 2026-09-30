import { useMemo, useState } from "react";
import { Tabs, Tooltip } from "@heroui/react";
import { cn } from "@/lib/utils";
import { CrawlIntervalBuilderWeekdayOptions } from "@/config/constants/dropdowns/agencies/crawl-interval-builder.options";
import { parseCronOccurrences } from "@/lib/cron-occurrences.utils";
import type { AgencyScheduleOverviewItem } from "@/features/agencies/interfaces/agencies.interfaces";

const HOUR_AXIS_MARKS = [0, 3, 6, 9, 12, 15, 18, 21];

// Sequential, single-hue (accent) ramp -- more agencies in a slot reads as a
// darker/more opaque cell, never a different hue.
const HEATMAP_LEVEL_CLASSES = [
  "bg-surface-secondary",
  "bg-accent/20",
  "bg-accent/45",
  "bg-accent/70",
  "bg-accent",
];

type ScheduleView = "weekly" | "hourly";

interface ParsedSchedule {
  agency: AgencyScheduleOverviewItem;
  hours: number[];
  weekdays: number[];
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function heatmapLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
}

// The scheduler resolves crawl_interval in Europe/Athens (see
// CrawlSchedulerCron), so "now" for highlighting purposes must be read in
// that zone too, not the viewer's own timezone.
function getAthensNow(): { weekday: number; hour: number } {
  const WEEKDAY_SHORT_TO_CRON: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Athens",
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(new Date());
    const weekdayShort = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
    const hourPart = parts.find((part) => part.type === "hour")?.value ?? "0";
    return {
      weekday: WEEKDAY_SHORT_TO_CRON[weekdayShort] ?? 1,
      hour: Number(hourPart) % 24,
    };
  } catch {
    return { weekday: 1, hour: 0 };
  }
}

function HourAxis() {
  return (
    <div className="relative h-4">
      {HOUR_AXIS_MARKS.map((hour, i) => (
        <span
          key={hour}
          className="absolute -translate-x-1/2 text-[10px] text-muted tabular-nums"
          style={{ left: `${(i / (HOUR_AXIS_MARKS.length - 1)) * 100}%` }}
        >
          {pad2(hour)}:00
        </span>
      ))}
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted">
      <span>Fewer</span>
      {HEATMAP_LEVEL_CLASSES.map((className, i) => (
        <span key={i} className={cn("size-2.5 rounded-[3px]", className)} />
      ))}
      <span>More</span>
    </div>
  );
}

function WeeklyGrid({
  cells,
  max,
  now,
}: {
  cells: Map<string, AgencyScheduleOverviewItem[]>;
  max: number;
  now: { weekday: number; hour: number };
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[38rem] flex flex-col gap-2">
        <div className="flex">
          <div className="w-14 shrink-0" />
          <div className="flex-1">
            <HourAxis />
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
          {CrawlIntervalBuilderWeekdayOptions.map((weekdayOption) => {
            const weekday = Number(weekdayOption.id);
            const isToday = weekday === now.weekday;

            return (
              <div key={weekdayOption.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-14 shrink-0 text-xs text-muted",
                    isToday && "font-semibold text-accent",
                  )}
                >
                  {weekdayOption.label.slice(0, 3)}
                </span>
                <div className="flex flex-1 gap-[2px]">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const agenciesAtCell = cells.get(`${weekday}-${hour}`) ?? [];
                    const level = heatmapLevel(agenciesAtCell.length, max);
                    const isNow = isToday && hour === now.hour;
                    const className = cn(
                      "h-4 flex-1 rounded-[3px]",
                      HEATMAP_LEVEL_CLASSES[level],
                      isNow && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                    );

                    if (agenciesAtCell.length === 0) {
                      return <div key={hour} className={className} />;
                    }

                    return (
                      <Tooltip key={hour} delay={150}>
                        <Tooltip.Trigger>
                          <button
                            type="button"
                            aria-label={`${weekdayOption.label} ${pad2(hour)}:00 — ${agenciesAtCell.length} agenc${agenciesAtCell.length === 1 ? "y" : "ies"}`}
                            className={cn(className, "transition-opacity hover:opacity-80")}
                          />
                        </Tooltip.Trigger>
                        <Tooltip.Content className="max-w-56">
                          <div className="flex flex-col gap-1 text-xs">
                            <p className="font-medium text-foreground">
                              {weekdayOption.label} {pad2(hour)}:00
                            </p>
                            {agenciesAtCell.map((agency) => (
                              <p key={agency.id} className="text-muted">
                                {agency.name}
                              </p>
                            ))}
                          </div>
                        </Tooltip.Content>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <HeatmapLegend />
      </div>
    </div>
  );
}

function HourlyBars({
  buckets,
  max,
  currentHour,
}: {
  buckets: Map<number, AgencyScheduleOverviewItem[]>;
  max: number;
  currentHour: number;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[38rem] flex flex-col gap-2">
        <div className="flex items-end gap-[3px] h-28 rounded-lg border border-border p-3">
          {Array.from({ length: 24 }, (_, hour) => {
            const agenciesAtHour = buckets.get(hour) ?? [];
            const count = agenciesAtHour.length;
            const heightPct = max === 0 ? 0 : (count / max) * 100;
            const isNow = hour === currentHour;

            const bar = (
              <div
                className={cn(
                  "w-full rounded-t-[4px] bg-accent",
                  isNow && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                )}
                style={{ height: count > 0 ? `${Math.max(heightPct, 6)}%` : "2px" }}
              />
            );

            return (
              <div key={hour} className="flex-1 h-full flex flex-col items-center justify-end">
                {count > 0 ? (
                  <Tooltip delay={150}>
                    <Tooltip.Trigger>
                      <button
                        type="button"
                        aria-label={`${pad2(hour)}:00 — ${count} agenc${count === 1 ? "y" : "ies"}`}
                        className="w-full h-full flex flex-col items-center justify-end transition-opacity hover:opacity-80"
                      >
                        {bar}
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content className="max-w-56">
                      <div className="flex flex-col gap-1 text-xs">
                        <p className="font-medium text-foreground">{pad2(hour)}:00, any day</p>
                        {agenciesAtHour.map((agency) => (
                          <p key={agency.id} className="text-muted">
                            {agency.name}
                          </p>
                        ))}
                      </div>
                    </Tooltip.Content>
                  </Tooltip>
                ) : (
                  bar
                )}
              </div>
            );
          })}
        </div>

        <HourAxis />
      </div>
    </div>
  );
}

export function AgencyScheduleVisual({ agencies }: { agencies: AgencyScheduleOverviewItem[] }) {
  const [view, setView] = useState<ScheduleView>("weekly");
  const now = useMemo(() => getAthensNow(), []);

  const { schedules, unreadable } = useMemo(() => {
    const schedules: ParsedSchedule[] = [];
    const unreadable: AgencyScheduleOverviewItem[] = [];
    for (const agency of agencies) {
      const occurrences = parseCronOccurrences(agency.crawl_interval);
      if (!occurrences) {
        unreadable.push(agency);
        continue;
      }
      schedules.push({ agency, ...occurrences });
    }
    return { schedules, unreadable };
  }, [agencies]);

  const weeklyCells = useMemo(() => {
    const map = new Map<string, AgencyScheduleOverviewItem[]>();
    for (const schedule of schedules) {
      for (const weekday of schedule.weekdays) {
        for (const hour of schedule.hours) {
          const key = `${weekday}-${hour}`;
          const list = map.get(key) ?? [];
          list.push(schedule.agency);
          map.set(key, list);
        }
      }
    }
    return map;
  }, [schedules]);

  const hourlyBuckets = useMemo(() => {
    const map = new Map<number, AgencyScheduleOverviewItem[]>();
    for (const schedule of schedules) {
      for (const hour of schedule.hours) {
        const list = map.get(hour) ?? [];
        if (!list.some((agency) => agency.id === schedule.agency.id)) {
          list.push(schedule.agency);
        }
        map.set(hour, list);
      }
    }
    return map;
  }, [schedules]);

  const weeklyMax = useMemo(
    () => Math.max(0, ...Array.from(weeklyCells.values(), (v) => v.length)),
    [weeklyCells],
  );
  const hourlyMax = useMemo(
    () => Math.max(0, ...Array.from(hourlyBuckets.values(), (v) => v.length)),
    [hourlyBuckets],
  );

  if (agencies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        No agencies to visualize yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Times shown in Athens time (Europe/Athens) — actual runs start a few minutes later to
        spread load across agencies sharing a slot.
      </p>

      <Tabs
        variant="secondary"
        selectedKey={view}
        onSelectionChange={(key) => setView(key as ScheduleView)}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Visual schedule view">
            <Tabs.Tab id="weekly">
              Weekly
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="hourly">
              Time of day
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="weekly" className="pt-4">
          <WeeklyGrid cells={weeklyCells} max={weeklyMax} now={now} />
        </Tabs.Panel>

        <Tabs.Panel id="hourly" className="pt-4">
          <p className="text-xs text-muted mb-2">
            Agencies scheduled around each hour, any day of the week.
          </p>
          <HourlyBars buckets={hourlyBuckets} max={hourlyMax} currentHour={now.hour} />
        </Tabs.Panel>
      </Tabs>

      {unreadable.length > 0 && (
        <p className="text-xs text-muted border-t border-border pt-3">
          Not shown (custom schedule the grid can&apos;t chart):{" "}
          {unreadable.map((agency) => agency.name).join(", ")}
        </p>
      )}
    </div>
  );
}
