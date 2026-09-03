import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Tooltip } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Routes } from "@/routes/routes";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { CrawlRunStatusFilterOptions } from "@/config/constants/dropdowns/agencies/crawl-run-status-filter.options";
import { useCrawlRunTimeline } from "@/features/crawl-runs/hooks/use-crawl-runs";
import {
  CrawlRunStatuses,
  type CrawlRunStatus,
  type CrawlRunTimelineQuery,
  type CrawlRunTimelineRow,
  type CrawlRunTimelineRunEntry,
} from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";
import { formatDateTime } from "@/lib/date";
import { formatDuration } from "@/lib/duration";

const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const LABEL_COLUMN_WIDTH = "w-44";

const STATUS_META: Record<CrawlRunStatus, { swatch: string; label: string }> = {
  [CrawlRunStatuses.QUEUED]: { swatch: "bg-default", label: "Queued" },
  [CrawlRunStatuses.RUNNING]: { swatch: "bg-accent", label: "Running" },
  [CrawlRunStatuses.SUCCESS]: { swatch: "bg-success", label: "Success" },
  [CrawlRunStatuses.PARTIAL_SUCCESS]: { swatch: "bg-warning", label: "Partial success" },
  [CrawlRunStatuses.FAILED]: { swatch: "bg-danger", label: "Failed" },
  [CrawlRunStatuses.CANCELLED]: { swatch: "bg-default", label: "Cancelled" },
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// All date math below is done with local Date components (getFullYear/getMonth/getDate
// and the (y, m, d) constructor), never toISOString/UTC helpers, so the chart's day
// boundaries, hour ticks and "now" line all line up with the viewer's own clock.
function toLocalIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getTodayIso() {
  return toLocalIsoDate(new Date());
}

function parseIsoDateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function shiftIsoDate(date: string, deltaDays: number) {
  const { y, m, d } = parseIsoDateParts(date);
  return toLocalIsoDate(new Date(y, m - 1, d + deltaDays));
}

function getLocalDayRangeMs(date: string) {
  const { y, m, d } = parseIsoDateParts(date);
  return {
    from: new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
    to: new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime(),
  };
}

function formatHourLabel(hour: number) {
  return `${pad2(hour % 24)}:00`;
}

function formatDateHeading(date: string) {
  const { y, m, d } = parseIsoDateParts(date);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface Bar {
  run: CrawlRunTimelineRunEntry;
  leftPct: number;
  widthPct: number;
  isPoint: boolean;
}

function buildBars(
  runs: CrawlRunTimelineRunEntry[],
  rangeFrom: number,
  rangeTo: number,
  nowMs: number,
): Bar[] {
  const span = Math.max(rangeTo - rangeFrom, 1);
  const clampPct = (ms: number) => Math.min(100, Math.max(0, ((ms - rangeFrom) / span) * 100));

  return runs.map((run) => {
    if (!run.started_at) {
      return { run, leftPct: clampPct(Date.parse(run.created_at)), widthPct: 0, isPoint: true };
    }

    const startMs = Date.parse(run.started_at);
    const endMs = run.finished_at ? Date.parse(run.finished_at) : Math.min(nowMs, rangeTo);

    const left = clampPct(startMs);
    const right = clampPct(Math.max(endMs, startMs));

    return { run, leftPct: left, widthPct: Math.max(right - left, 0.35), isPoint: false };
  });
}

function getPeakConcurrency(
  rows: CrawlRunTimelineRow[],
  rangeFrom: number,
  rangeTo: number,
  nowMs: number,
) {
  const events: Array<[number, number]> = [];
  for (const row of rows) {
    for (const run of row.runs) {
      if (!run.started_at) continue;
      const start = Math.max(Date.parse(run.started_at), rangeFrom);
      const end = Math.min(run.finished_at ? Date.parse(run.finished_at) : nowMs, rangeTo);
      if (end <= start) continue;
      events.push([start, 1]);
      events.push([end, -1]);
    }
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

export function CrawlRunsTimeline() {
  const navigate = useNavigate();
  const [date, setDate] = useState(getTodayIso());

  const { from: rangeFromLocal, to: rangeToLocal } = useMemo(() => getLocalDayRangeMs(date), [date]);

  const query = useMemo<CrawlRunTimelineQuery>(
    () => ({
      date_from: new Date(rangeFromLocal).toISOString(),
      date_to: new Date(rangeToLocal).toISOString(),
    }),
    [rangeFromLocal, rangeToLocal],
  );

  const { data, isPending } = useCrawlRunTimeline(query);
  const rows = data?.rows ?? [];
  const isToday = date === getTodayIso();
  const nowMs = Date.now();
  const rangeFrom = data ? Date.parse(data.range_from) : rangeFromLocal;
  const rangeTo = data ? Date.parse(data.range_to) : rangeToLocal;
  const nowPct =
    isToday && nowMs >= rangeFrom && nowMs <= rangeTo
      ? ((nowMs - rangeFrom) / Math.max(rangeTo - rangeFrom, 1)) * 100
      : null;

  const stats = useMemo(() => {
    let total = 0;
    let active = 0;
    let success = 0;
    let failed = 0;
    for (const row of rows) {
      for (const run of row.runs) {
        total += 1;
        if (run.status === CrawlRunStatuses.RUNNING || run.status === CrawlRunStatuses.QUEUED) active += 1;
        if (run.status === CrawlRunStatuses.SUCCESS) success += 1;
        if (run.status === CrawlRunStatuses.FAILED) failed += 1;
      }
    }
    return {
      total,
      active,
      success,
      failed,
      peak: getPeakConcurrency(rows, rangeFrom, rangeTo, nowMs),
    };
  }, [rows, rangeFrom, rangeTo, nowMs]);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">Crawl timeline</p>
          <p className="text-xs text-muted">
            One row per agency &mdash; bar color is crawl status, bar length is how long it ran (your local time).
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous day"
            className="min-w-8 px-2"
            onPress={() => setDate((d) => shiftIsoDate(d, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <DatePickerField aria-label="Timeline date" value={date} onChange={setDate} className="w-40" />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next day"
            className="min-w-8 px-2"
            onPress={() => setDate((d) => shiftIsoDate(d, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {!isToday && (
            <Button variant="secondary" size="sm" onPress={() => setDate(getTodayIso())}>
              Today
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Runs" value={isPending ? "—" : stats.total} />
        <StatTile
          label="Peak parallel"
          value={isPending ? "—" : stats.peak}
          valueClassName="text-accent"
        />
        <StatTile label="Active now" value={isPending ? "—" : stats.active} valueClassName="text-accent" />
        <StatTile label="Success" value={isPending ? "—" : stats.success} valueClassName="text-success" />
        <StatTile
          label="Failed"
          value={isPending ? "—" : stats.failed}
          valueClassName={stats.failed > 0 ? "text-danger" : undefined}
        />
      </div>

      {isPending ? (
        <div className="h-64 rounded-lg bg-surface-secondary animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
          No crawl runs on {formatDateHeading(date)}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[42rem] flex flex-col gap-2">
            <div className="flex">
              <div className={cn(LABEL_COLUMN_WIDTH, "shrink-0")} />
              <div className="relative flex-1 h-5">
                {HOUR_MARKS.map((hour, i) => (
                  <span
                    key={hour}
                    className="absolute -translate-x-1/2 text-[10px] text-muted tabular-nums"
                    style={{ left: `${(i / (HOUR_MARKS.length - 1)) * 100}%` }}
                  >
                    {formatHourLabel(hour)}
                  </span>
                ))}
                {nowPct !== null && (
                  <span
                    className="absolute -translate-x-1/2 text-[10px] font-medium text-accent"
                    style={{ left: `${nowPct}%` }}
                  >
                    now
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col rounded-lg border border-border overflow-hidden">
              {rows.map((row, index) => (
                <div
                  key={row.agency_id}
                  className={cn(
                    "flex items-center border-b border-border last:border-b-0",
                    index % 2 === 1 && "bg-surface-secondary/50",
                  )}
                >
                  <div className={cn(LABEL_COLUMN_WIDTH, "shrink-0 px-3 py-2 border-r border-border min-w-0")}>
                    <p className="text-xs font-medium text-foreground truncate" title={row.agency_name}>
                      {row.agency_name}
                    </p>
                    {row.scraper_name && (
                      <p className="text-[10px] text-muted truncate" title={row.scraper_name}>
                        {row.scraper_name}
                      </p>
                    )}
                  </div>
                  <div className="relative flex-1 h-10">
                    {HOUR_MARKS.map((hour, i) => (
                      <div
                        key={hour}
                        className="absolute inset-y-0 border-l border-border/60"
                        style={{ left: `${(i / (HOUR_MARKS.length - 1)) * 100}%` }}
                      />
                    ))}
                    {nowPct !== null && (
                      <div
                        className="absolute inset-y-0 w-px bg-accent z-10"
                        style={{ left: `${nowPct}%` }}
                      />
                    )}
                    {buildBars(row.runs, rangeFrom, rangeTo, nowMs).map((bar) => (
                      <RunBar
                        key={bar.run.id}
                        bar={bar}
                        agencyName={row.agency_name}
                        scraperName={row.scraper_name}
                        onSelect={(id) => navigate(Routes.admin.crawlRuns.detail(id))}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3">
        {Object.values(CrawlRunStatuses).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={cn("size-2.5 rounded-full", STATUS_META[s].swatch)} />
            {STATUS_META[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number | string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-secondary/50 p-3">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={cn("font-mono text-xl font-bold tabular-nums text-foreground", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function RunBar({
  bar,
  agencyName,
  scraperName,
  onSelect,
}: {
  bar: Bar;
  agencyName: string;
  scraperName: string | null;
  onSelect: (id: string) => void;
}) {
  const { run } = bar;
  const meta = STATUS_META[run.status];
  const label = getDropdownOptionLabel(CrawlRunStatusFilterOptions, run.status);
  const isRunning = run.status === CrawlRunStatuses.RUNNING;
  const isCancelled = run.status === CrawlRunStatuses.CANCELLED;

  const tooltipContent = (
    <div className="flex flex-col gap-1 text-xs">
      <p className="font-medium text-foreground">{scraperName ?? agencyName}</p>
      <p className="text-muted">{label}</p>
      <p className="text-muted">
        {run.started_at ? formatDateTime(run.started_at) : `Queued ${formatDateTime(run.created_at)}`}
        {run.finished_at
          ? ` → ${formatDateTime(run.finished_at)}`
          : run.started_at
            ? " → now"
            : ""}
      </p>
      {run.duration_ms !== null && <p className="text-muted">Duration: {formatDuration(run.duration_ms)}</p>}
      <p className="text-muted">
        Found {run.total_found} · New {run.total_new_listings}
      </p>
      {run.error_message && <p className="text-danger break-words">{run.error_message}</p>}
    </div>
  );

  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger>
        <button
          type="button"
          aria-label={`${label} crawl run for ${scraperName ?? agencyName}`}
          onClick={() => onSelect(run.id)}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-[4px] transition-opacity hover:opacity-80",
            meta.swatch,
            bar.isPoint
              ? "size-2.5 -translate-x-1/2 rounded-full ring-2 ring-surface"
              : "h-4",
            isRunning && "animate-pulse",
            isCancelled && "opacity-60 border border-dashed border-foreground/40",
          )}
          style={
            bar.isPoint
              ? { left: `${bar.leftPct}%` }
              : { left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }
          }
        />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-64">{tooltipContent}</Tooltip.Content>
    </Tooltip>
  );
}
