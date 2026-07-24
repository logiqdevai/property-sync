import { Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { useUserDashboard } from "@/features/user-dashboard/hooks/use-user-dashboard";
import type { UserDashboardActivityItem } from "@/features/user-dashboard/interfaces/user-dashboard.interfaces";
import { formatPropertyHistoryLabel } from "@/features/properties/utils/format-property-history";
import { formatDateTime } from "@/lib/date";
import { Routes } from "@/routes/routes";

function ListingSection({
  title,
  entries,
  isPending,
}: {
  title: string;
  entries: UserDashboardActivityItem[];
  isPending: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-surface p-6"
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      <p className="mb-4 text-sm font-medium text-foreground">{title}</p>
      {isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No listings yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => {
            const content = (
              <div className="flex items-start justify-between gap-3 text-sm border border-border rounded-lg p-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium text-foreground truncate">
                    {entry.property_title}
                  </span>
                  <span className="text-muted">{formatPropertyHistoryLabel(entry)}</span>
                </div>
                <span className="text-xs text-muted whitespace-nowrap">
                  {formatDateTime(entry.created_at)}
                </span>
              </div>
            );

            if (!entry.user_property_id) {
              return <li key={entry.id}>{content}</li>;
            }

            return (
              <li key={entry.id}>
                <Link
                  to={Routes.dashboard.properties.detail(entry.user_property_id)}
                  className="block hover:opacity-90 transition-opacity"
                >
                  {content}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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
    <div className="space-y-6">
      <div
        className="rounded-xl border border-border bg-surface p-6"
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome back, {displayName}
        </p>
        <p className="mt-1 text-sm text-muted">
          Monitor scrapers, crawls, and property changes across your agencies.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5"
            style={{ boxShadow: "var(--shadow-1)" }}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {stat.label}
            </p>
            <p
              className="font-mono text-3xl font-bold"
              style={{ color: stat.accent ? "var(--tertiary)" : "var(--foreground)" }}
            >
              {isPending || stat.value == null ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ListingSection
          title="Recently Added"
          entries={dashboard?.listings.added ?? []}
          isPending={isPending}
        />
        <ListingSection
          title="Recently Updated"
          entries={dashboard?.listings.updated ?? []}
          isPending={isPending}
        />
        <ListingSection
          title="Recently Removed"
          entries={dashboard?.listings.removed ?? []}
          isPending={isPending}
        />
      </div>
    </div>
  );
}
