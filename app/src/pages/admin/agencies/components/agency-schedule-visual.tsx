import { useMemo, useState } from "react";
import { Tabs, Tooltip } from "@heroui/react";
import { cn } from "@/lib/utils";
import { CrawlIntervalBuilderWeekdayOptions } from "@/config/constants/dropdowns/agencies/crawl-interval-builder.options";
import { parseCronOccurrences } from "@/lib/cron-occurrences.utils";
import type { AgencyScheduleOverviewItem } from "@/features/agencies/interfaces/agencies.interfaces";

const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const LABEL_COLUMN_WIDTH = "w-44";

// Sequential, single-hue (accent) background -- purely a quick-scan aid. The
// count printed in the cell is what's actually being read; color never
// carries meaning on its own.
const HEATMAP_LEVEL_CLASSES = [
  "bg-transparent",
  "bg-accent/10",
  "bg-accent/20",
  "bg-accent/35",
  "bg-accent/55",
];

function heatmapLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
}

type VisualView = "timeline" | "load";

interface ParsedSchedule {
  agency: AgencyScheduleOverviewItem;
  hours: number[];
  weekdays: number[];
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatHourLabel(hour: number) {
  return `${pad2(hour % 24)}:00`;
}

// The scheduler resolves crawl_interval in Europe/Athens (see
// CrawlSchedulerCron), so "now" must be read in that zone too, not the
// viewer's own timezone, or the "now" line would point at the wrong column.
function getAthensNow(): { weekday: number; hour: number; minute: number } {
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
      minute: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(new Date());
    const weekdayShort = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return { weekday: WEEKDAY_SHORT_TO_CRON[weekdayShort] ?? 1, hour, minute };
  } catch {
    return { weekday: 1, hour: 0, minute: 0 };
  }
}

function daysSummary(weekdays: number[]): string {
  if (weekdays.length === 7) return "Daily";
  return CrawlIntervalBuilderWeekdayOptions.filter((option) => weekdays.includes(Number(option.id)))
    .map((option) => option.label.slice(0, 3))
    .join(", ");
}

// One letter per weekday, filled when the agency runs that day -- a literal,
// always-visible answer to "which days", no color-intensity decoding needed.
function DayDots({ weekdays }: { weekdays: number[] }) {
  return (
    <div className="flex items-center gap-[3px]">
      {CrawlIntervalBuilderWeekdayOptions.map((option) => {
        const active = weekdays.includes(Number(option.id));
        return (
          <span
            key={option.id}
            title={option.label}
            className={cn(
              "flex items-center justify-center size-[14px] shrink-0 rounded-full text-[8px] font-semibold leading-none",
              active ? "bg-accent text-white" : "bg-surface-secondary text-muted",
            )}
          >
            {option.label[0]}
          </span>
        );
      })}
    </div>
  );
}

function HourAxis({ nowPct }: { nowPct: number }) {
  return (
    <div className="relative h-4">
      {HOUR_MARKS.map((hour, i) => (
        <span
          key={hour}
          className="absolute -translate-x-1/2 text-[10px] text-muted tabular-nums"
          style={{ left: `${(i / (HOUR_MARKS.length - 1)) * 100}%` }}
        >
          {formatHourLabel(hour)}
        </span>
      ))}
      <span
        className="absolute -translate-x-1/2 text-[10px] font-medium text-accent"
        style={{ left: `${nowPct}%` }}
      >
        now
      </span>
    </div>
  );
}

function ScheduleRow({
  schedule,
  index,
  nowPct,
}: {
  schedule: ParsedSchedule;
  index: number;
  nowPct: number;
}) {
  const { agency } = schedule;

  return (
    <div
      className={cn(
        "flex items-center border-b border-border last:border-b-0",
        index % 2 === 1 && "bg-surface-secondary/50",
      )}
    >
      <div
        className={cn(
          LABEL_COLUMN_WIDTH,
          "shrink-0 px-3 py-2 border-r border-border min-w-0 flex flex-col gap-1",
        )}
      >
        <p className="text-xs font-medium text-foreground truncate" title={agency.name}>
          {agency.name}
        </p>
        <DayDots weekdays={schedule.weekdays} />
      </div>

      <div className="relative flex-1 h-10">
        {HOUR_MARKS.map((hour) => (
          <div
            key={hour}
            className="absolute inset-y-0 border-l border-border/60"
            style={{ left: `${(hour / 24) * 100}%` }}
          />
        ))}
        <div className="absolute inset-y-0 w-px bg-accent/40" style={{ left: `${nowPct}%` }} />

        {schedule.hours.map((hour) => (
          <Tooltip key={hour} delay={150}>
            <Tooltip.Trigger>
              <button
                type="button"
                aria-label={`${agency.name} runs at ${formatHourLabel(hour)}, ${daysSummary(schedule.weekdays)}`}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-2.5 rounded-full bg-accent ring-2 ring-surface transition-opacity hover:opacity-80"
                style={{ left: `${(hour / 24) * 100}%` }}
              />
            </Tooltip.Trigger>
            <Tooltip.Content className="max-w-60">
              <div className="flex flex-col gap-1 text-xs">
                <p className="font-medium text-foreground">{agency.name}</p>
                <p className="text-muted">
                  {formatHourLabel(hour)} · {daysSummary(schedule.weekdays)}
                </p>
                <p className="text-muted">{agency.user_properties_count} tracked properties</p>
              </div>
            </Tooltip.Content>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

// Renders as 24 equal-width flex slots -- the exact grid the day rows below
// use -- so a tick sits under its own column by construction, never drifting
// from an independently-computed percentage offset.
function GridHourAxisRow() {
  return (
    <div className="flex gap-px">
      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} className="flex-1 text-center">
          {hour % 3 === 0 && (
            <span className="text-[9px] text-muted tabular-nums">{pad2(hour)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function DayHourGrid({
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
      <div className="min-w-[44rem] flex flex-col gap-2">
        <div className="flex flex-col gap-px rounded-lg border border-border p-2">
          <div className="flex items-center">
            <span className="w-12 shrink-0" />
            <div className="flex-1">
              <GridHourAxisRow />
            </div>
          </div>

          {CrawlIntervalBuilderWeekdayOptions.map((weekdayOption) => {
            const weekday = Number(weekdayOption.id);
            const isToday = weekday === now.weekday;

            return (
              <div key={weekdayOption.id} className="flex items-center">
                <span
                  className={cn(
                    "w-12 shrink-0 text-xs text-muted",
                    isToday && "font-semibold text-accent",
                  )}
                >
                  {weekdayOption.label.slice(0, 3)}
                </span>
                <div className="flex flex-1 gap-px">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const agenciesAtCell = cells.get(`${weekday}-${hour}`) ?? [];
                    const count = agenciesAtCell.length;
                    const level = heatmapLevel(count, max);
                    const isNow = isToday && hour === now.hour;
                    const cellClassName = cn(
                      "h-7 flex-1 flex items-center justify-center rounded-[3px] text-[10px] font-medium tabular-nums",
                      HEATMAP_LEVEL_CLASSES[level],
                      count > 0 ? "text-foreground" : "text-transparent",
                      isNow && "ring-1 ring-accent",
                    );

                    if (count === 0) {
                      return (
                        <div key={hour} className={cellClassName}>
                          {count}
                        </div>
                      );
                    }

                    return (
                      <Tooltip key={hour} delay={150}>
                        <Tooltip.Trigger>
                          <button
                            type="button"
                            aria-label={`${weekdayOption.label} ${formatHourLabel(hour)} — ${count} agenc${count === 1 ? "y" : "ies"}`}
                            className={cn(cellClassName, "transition-opacity hover:opacity-80")}
                          >
                            {count}
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Content className="max-w-56">
                          <div className="flex flex-col gap-1 text-xs">
                            <p className="font-medium text-foreground">
                              {weekdayOption.label} {formatHourLabel(hour)}
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
      </div>
    </div>
  );
}

export function AgencyScheduleVisual({ agencies }: { agencies: AgencyScheduleOverviewItem[] }) {
  const [view, setView] = useState<VisualView>("timeline");
  const now = useMemo(() => getAthensNow(), []);
  const nowPct = ((now.hour + now.minute / 60) / 24) * 100;

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
    // Group same-hour agencies together so a pile-up is a visible cluster of
    // dots in the same column, not something you have to hunt row by row for.
    schedules.sort(
      (a, b) => a.hours[0] - b.hours[0] || a.agency.name.localeCompare(b.agency.name),
    );
    return { schedules, unreadable };
  }, [agencies]);

  const busiestHours = useMemo(() => {
    const counts = new Map<number, number>();
    for (const schedule of schedules) {
      for (const hour of schedule.hours) {
        counts.set(hour, (counts.get(hour) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 4);
  }, [schedules]);

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

  const weeklyMax = useMemo(
    () => Math.max(0, ...Array.from(weeklyCells.values(), (v) => v.length)),
    [weeklyCells],
  );

  if (agencies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        No agencies to visualize yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-xs text-muted max-w-md">
          Athens time. Hover any marker for agency details.
        </p>
        {busiestHours.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-muted">Busiest:</span>
            {busiestHours.map(([hour, count]) => (
              <span
                key={hour}
                className="rounded-full bg-accent/15 text-accent px-2 py-0.5 font-medium tabular-nums"
              >
                {formatHourLabel(hour)} · {count}
              </span>
            ))}
          </div>
        )}
      </div>

      <Tabs variant="secondary" selectedKey={view} onSelectionChange={(key) => setView(key as VisualView)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Visual schedule view">
            <Tabs.Tab id="timeline">
              Timeline
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="load">
              Load by day &amp; hour
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="timeline" className="pt-3">
          <p className="text-xs text-muted mb-2">
            One row per agency. A dot marks an hour it&apos;s scheduled to run; the letters show
            which days.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[44rem] flex flex-col gap-2">
              <div className="flex">
                <div className={cn(LABEL_COLUMN_WIDTH, "shrink-0")} />
                <div className="relative flex-1">
                  <HourAxis nowPct={nowPct} />
                </div>
              </div>

              <div className="flex flex-col rounded-lg border border-border overflow-hidden">
                {schedules.map((schedule, index) => (
                  <ScheduleRow
                    key={schedule.agency.id}
                    schedule={schedule}
                    index={index}
                    nowPct={nowPct}
                  />
                ))}
              </div>
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="load" className="pt-3">
          <p className="text-xs text-muted mb-2">
            Rows are days, columns are hours. The number in a cell is how many agencies are
            scheduled at that exact day and hour &mdash; thin out any cell with several.
          </p>
          <DayHourGrid cells={weeklyCells} max={weeklyMax} now={now} />
        </Tabs.Panel>
      </Tabs>

      {unreadable.length > 0 && (
        <p className="text-xs text-muted border-t border-border pt-3">
          Not shown (custom schedule this view can&apos;t chart):{" "}
          {unreadable.map((agency) => agency.name).join(", ")}
        </p>
      )}
    </div>
  );
}
