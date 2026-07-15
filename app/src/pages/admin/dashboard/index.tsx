import { Link } from "react-router-dom";
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard";
import type { ActivityFeedItem } from "@/features/dashboard/interfaces/dashboard.interfaces";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{
        background: "color-mix(in oklch, var(--surface-secondary) 80%, transparent)",
        boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--border) 60%, transparent)",
      }}
    >
      <span className="text-xs font-medium text-muted uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-semibold text-foreground tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

function KpiSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function resolveActivityLink(item: ActivityFeedItem): string | null {
  if (item.crawl_run_id) {
    return Routes.admin.crawlRuns.detail(item.crawl_run_id);
  }
  if (item.generation_run_id) {
    return Routes.admin.generationRuns.detail(item.generation_run_id);
  }
  if (item.scraper_id) {
    return Routes.admin.scrapers.detail(item.scraper_id);
  }
  if (item.property_id) {
    return Routes.admin.properties.detail(item.property_id);
  }
  if (item.source_agency_id) {
    return Routes.admin.agencies.detail(item.source_agency_id);
  }
  return null;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function AdminDashboardPage() {
  const { data, isPending } = useDashboard();

  if (isPending || !data) {
    return <DetailSkeleton fieldCount={8} showSubTable subTableRows={6} />;
  }

  const { kpis, activity } = data;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</p>
        <p className="text-sm text-muted">Platform overview and recent activity.</p>
      </div>

      <KpiSection title="Scrapers">
        <KpiCard label="Total" value={kpis.scrapers_total} />
        <KpiCard label="Active" value={kpis.scrapers_active} />
        <KpiCard label="Broken" value={kpis.scrapers_broken} />
        <KpiCard label="Running crawls" value={kpis.running_crawls} />
        <KpiCard label="Failed crawls (24h)" value={kpis.failed_crawls_24h} />
        <KpiCard
          label="Last crawl"
          value={kpis.last_crawl_at ? formatTimestamp(kpis.last_crawl_at) : "—"}
        />
      </KpiSection>

      <KpiSection title="Agencies">
        <KpiCard label="Total" value={kpis.agencies_total} />
        <KpiCard label="Visible & trackable" value={kpis.agencies_active} />
        <KpiCard label="Visible only" value={kpis.agencies_disabled} />
        <KpiCard label="Hidden" value={kpis.agencies_archived} />
      </KpiSection>

      <KpiSection title="Properties">
        <KpiCard label="Total" value={kpis.properties_total} />
        <KpiCard label="Imported today" value={kpis.properties_imported_today} />
        <KpiCard label="Updated today" value={kpis.properties_updated_today} />
        <KpiCard label="Removed today" value={kpis.properties_removed_today} />
        <KpiCard label="Failed extractions today" value={kpis.failed_properties_today} />
      </KpiSection>

      <KpiSection title="Queue">
        <KpiCard label="Waiting" value={kpis.queue_waiting} />
        <KpiCard label="Active" value={kpis.queue_active} />
        <KpiCard label="Failed" value={kpis.queue_failed} />
      </KpiSection>

      <KpiSection title="AI & Integrations">
        <KpiCard label="Active generation runs" value={kpis.active_generation_runs} />
        <KpiCard
          label="Integration connections"
          value={kpis.active_integrations}
          sub={`${kpis.total_integrations} total configured`}
        />
        <KpiCard label="Unread notifications" value={kpis.unread_notifications} />
      </KpiSection>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
        <div
          className="rounded-xl overflow-hidden"
          style={{
            boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--border) 60%, transparent)",
          }}
        >
          {activity.length === 0 ? (
            <p className="p-6 text-sm text-muted">No recent activity yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((item, index) => {
                const href = resolveActivityLink(item);
                const content = (
                  <div className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-surface-secondary/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{item.summary}</p>
                      <p className="text-xs text-muted mt-0.5 capitalize">
                        {item.type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <time className="text-xs text-muted shrink-0 tabular-nums">
                      {formatTimestamp(item.timestamp)}
                    </time>
                  </div>
                );

                return (
                  <li key={`${item.type}-${item.timestamp}-${index}`}>
                    {href ? (
                      <Link to={href} className="block">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
