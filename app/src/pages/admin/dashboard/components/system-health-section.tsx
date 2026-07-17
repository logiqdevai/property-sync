import { Skeleton } from "@heroui/react";
import { useHealth } from "@/features/health/hooks/use-health";
import {
  HealthCheckKeys,
  type HealthCheckKey,
  type HealthIndicatorDetail,
} from "@/features/health/interfaces/health.interfaces";
import { cn } from "@/lib/utils";

const HEALTH_LABELS: { key: HealthCheckKey; label: string }[] = [
  { key: HealthCheckKeys.API, label: "API" },
  { key: HealthCheckKeys.DATABASE, label: "Database" },
  { key: HealthCheckKeys.REDIS, label: "Redis" },
];

function resolveDetail(
  details: Record<string, HealthIndicatorDetail> | undefined,
  key: HealthCheckKey,
): HealthIndicatorDetail | null {
  return details?.[key] ?? null;
}

function HealthCard({
  label,
  detail,
}: {
  label: string;
  detail: HealthIndicatorDetail | null;
}) {
  const isUp = detail?.status === "up";
  const isUnknown = !detail;
  const sub =
    typeof detail?.message === "string"
      ? detail.message
      : typeof detail?.uptime_seconds === "number"
        ? `Uptime ${detail.uptime_seconds}s`
        : undefined;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{
        background: "color-mix(in oklch, var(--surface-secondary) 80%, transparent)",
        boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--border) 60%, transparent)",
      }}
    >
      <span className="text-xs font-medium text-muted uppercase tracking-wide">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          isUnknown && "text-muted",
          isUp && "text-success",
          !isUnknown && !isUp && "text-danger",
        )}
      >
        {isUnknown ? "—" : isUp ? "Up" : "Down"}
      </span>
      {sub && <span className="text-xs text-muted truncate">{sub}</span>}
    </div>
  );
}

export function SystemHealthSection() {
  const { data, isPending, isError } = useHealth();

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">System health</h2>
      {isPending ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {HEALTH_LABELS.map((item) => (
            <Skeleton key={item.key} className="h-[88px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {HEALTH_LABELS.map((item) => (
            <HealthCard key={item.key} label={item.label} detail={{ status: "down", message: "Unreachable" }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {HEALTH_LABELS.map((item) => (
            <HealthCard
              key={item.key}
              label={item.label}
              detail={resolveDetail(data?.details, item.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
