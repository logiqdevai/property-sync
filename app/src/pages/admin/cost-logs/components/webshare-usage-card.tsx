import { useWebshareUsage } from "@/features/cost-logs/hooks/use-cost-logs";
import { formatBytes } from "@/lib/bytes";
import { formatDate } from "@/lib/date";

function barColor(percent: number) {
  if (percent >= 90) return "bg-danger";
  if (percent >= 70) return "bg-warning";
  return "bg-accent";
}

export function WebshareUsageCard() {
  const { data, isPending, isError } = useWebshareUsage();

  if (isPending) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Loading Webshare usage…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-danger">
        Could not load Webshare usage.
      </div>
    );
  }

  if (!data.configured) return null;

  const percent = data.percent_used ?? 0;
  const hasLimit = data.limit_bytes !== null && data.limit_bytes !== undefined;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Webshare proxy bandwidth
          </p>
          <p className="text-xs text-muted">
            {data.plan ? `${data.plan.proxy_type} ${data.plan.proxy_subtype}` : "Proxy plan"}
            {data.period_start && data.period_end
              ? ` · ${formatDate(data.period_start)} – ${formatDate(data.period_end)}`
              : ""}
          </p>
        </div>
        <p className="font-mono text-2xl font-bold text-foreground">
          {formatBytes(data.used_bytes)}
          {hasLimit && (
            <span className="text-base font-medium text-muted">
              {" "}
              / {formatBytes(data.limit_bytes)}
            </span>
          )}
        </p>
      </div>

      {hasLimit && (
        <>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-default"
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full ${barColor(percent)}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{percent.toFixed(2)}% used</span>
            <span>{formatBytes(data.remaining_bytes)} remaining</span>
          </div>
        </>
      )}

      <p className="text-xs text-muted">
        {data.requests_total ?? 0} request(s), {data.requests_failed ?? 0} failed this period
      </p>
    </div>
  );
}
