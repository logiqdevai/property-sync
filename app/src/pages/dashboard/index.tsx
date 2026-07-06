import { useAuthStore } from "@/stores/auth";

const stats = [
  { label: "Total Properties", value: "—", accent: false },
  { label: "Active Scrapers", value: "—", accent: false },
  { label: "Imported Today", value: "—", accent: true },
  { label: "Running Crawls", value: "—", accent: false },
];

export default function DashboardHome() {
  const { full_name, email } = useAuthStore();
  const displayName = full_name || email || "there";

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div
        className="rounded-xl border border-border bg-surface p-6"
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <p className="mb-4 text-sm font-medium text-foreground">Recent Activity</p>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-lg bg-surface-secondary"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
