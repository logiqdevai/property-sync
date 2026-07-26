import { useAuthStore } from "@/stores/auth";
import { useUserDashboard } from "@/features/user-dashboard/hooks/use-user-dashboard";
import { formatDateTime } from "@/lib/date";
import { ActivityChangeLabel } from "./components/activity-change-label";

export default function DashboardHome() {
  const { full_name, email } = useAuthStore();
  const displayName = full_name || email || "there";
  const { data: dashboard, isPending } = useUserDashboard();

  const stats = [
    { label: "Total Properties", value: dashboard?.stats.total_properties, accent: false },
    { label: "Active Listings", value: dashboard?.stats.active_properties, accent: false },
    { label: "Added This Week", value: dashboard?.stats.properties_added_this_week, accent: true },
    {
      label: "Updated This Week",
      value: dashboard?.stats.properties_updated_this_week,
      accent: false,
    },
    {
      label: "Removed This Week",
      value: dashboard?.stats.properties_removed_this_week,
      accent: false,
    },
    { label: "Tracked Agencies", value: dashboard?.stats.tracked_agencies, accent: false },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div
        className="rounded-xl border border-border bg-surface p-4 sm:p-6"
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <p className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground break-words">
          Welcome back, {displayName}
        </p>
        <p className="mt-1 text-sm text-muted">
          Monitor scrapers, crawls, and property changes across your agencies.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:p-5"
            style={{ boxShadow: "var(--shadow-1)" }}
          >
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted leading-snug">
              {stat.label}
            </p>
            <p
              className="font-mono text-2xl sm:text-3xl font-bold tabular-nums"
              style={{ color: stat.accent ? "var(--tertiary)" : "var(--foreground)" }}
            >
              {isPending || stat.value == null ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div
        className="rounded-xl border border-border bg-surface p-4 sm:p-6 min-w-0"
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <p className="mb-4 text-sm font-medium text-foreground">Recent Activity</p>
        {isPending ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : !dashboard || dashboard.activity.length === 0 ? (
          <p className="text-sm text-muted">No recent activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {dashboard.activity.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 text-sm border border-border rounded-lg p-3 min-w-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium text-foreground break-words">
                    {entry.property_title}
                  </span>
                  <ActivityChangeLabel entry={entry} />
                </div>
                <span className="text-xs text-muted whitespace-nowrap shrink-0">
                  {formatDateTime(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
