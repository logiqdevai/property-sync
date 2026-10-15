import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, ListBox, Select, Tabs, useOverlayState } from "@heroui/react";
import { PropertyClientsModal } from "./properties/components/property-clients-modal";
import { DelistedAlertsList } from "@/components/property-clients/delisted-alerts-list";
import {
  useAcknowledgeDelistedAlerts,
  useDelistedAlerts,
} from "@/features/property-clients/hooks/use-property-clients";
import { useAuthStore } from "@/stores/auth";
import { useUserDashboard } from "@/features/user-dashboard/hooks/use-user-dashboard";
import type { ActivityPeriod } from "@/features/user-dashboard/interfaces/user-dashboard.interfaces";
import { formatDateTime } from "@/lib/date";
import { ActivityChangeLabel } from "./components/activity-change-label";

const PERIOD_OPTIONS: { id: ActivityPeriod; label: string }[] = [
  { id: "day", label: "Last day" },
  { id: "week", label: "Last week" },
  { id: "month", label: "Last month" },
];

export default function DashboardHome() {
  const { full_name, email } = useAuthStore();
  const displayName = full_name || email || "there";
  const [period, setPeriod] = useState<ActivityPeriod>("week");
  const clientsModal = useOverlayState();
  const [clientsProperty, setClientsProperty] = useState<{ id: string; title: string } | null>(
    null,
  );
  const openClients = (property: { id: string; title: string }) => {
    setClientsProperty(property);
    clientsModal.open();
  };
  const [activityType, setActivityType] = useState<"all" | "delisted">("all");
  const { data: dashboard, isPending } = useUserDashboard(period);
  const { data: delistedAlerts = [] } = useDelistedAlerts();
  const acknowledgeAlerts = useAcknowledgeDelistedAlerts();
  const { data: allDelisted = [], isPending: allDelistedPending } = useDelistedAlerts(true);

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

      {delistedAlerts.length > 0 && (
        <div
          className="min-w-0 rounded-xl border border-danger/40 bg-danger/10 p-4 sm:p-6"
          style={{ boxShadow: "var(--shadow-1)" }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {delistedAlerts.length === 1
                  ? "A property you showed to clients was removed"
                  : `${delistedAlerts.length} properties you showed to clients were removed`}
              </p>
              <p className="text-sm text-muted">
                No longer on the agency website. Mark as seen once you have reviewed them.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              isPending={acknowledgeAlerts.isPending}
              onPress={() =>
                acknowledgeAlerts.mutate(delistedAlerts.map((a) => a.user_property_id))
              }
            >
              Mark as seen
            </Button>
          </div>
          <DelistedAlertsList alerts={delistedAlerts} onOpenClients={openClients} />
        </div>
      )}

      <div
        className="rounded-xl border border-border bg-surface p-4 sm:p-6 min-w-0"
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <p className="mb-3 text-sm font-medium text-foreground">Recent Activity</p>
        <Tabs
          className="mb-4 w-full"
          selectedKey={activityType}
          onSelectionChange={(key) =>
            setActivityType(key === "delisted" ? "delisted" : "all")
          }
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Recent activity">
              <Tabs.Tab id="all">
                Properties
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="delisted">
                Delisted alerts{allDelisted.length > 0 ? ` (${allDelisted.length})` : ""}
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <div className="mb-4 flex items-center justify-end gap-3 empty:hidden">
          {activityType === "all" ? (
          <Select
            aria-label="Activity period"
            className="w-36"
            selectedKey={period}
            onSelectionChange={(key) => {
              if (key != null) setPeriod(String(key) as ActivityPeriod);
            }}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {PERIOD_OPTIONS.map((option) => (
                  <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                    {option.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          ) : null}
        </div>
        {activityType === "delisted" ? (
          allDelistedPending ? (
            <div className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
          ) : allDelisted.length === 0 ? (
            <p className="text-sm text-muted">
              No delisted properties with clients.
            </p>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto">
              <DelistedAlertsList alerts={allDelisted} onOpenClients={openClients} />
            </div>
          )
        ) : isPending ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : !dashboard || dashboard.activity.length === 0 ? (
          <p className="text-sm text-muted">No activity in this period.</p>
        ) : (
          <ul className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto">
            {dashboard.activity.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 text-sm border border-border rounded-lg p-3 min-w-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  {entry.user_property_id ? (
                    <Link
                      to={`/properties/${entry.user_property_id}`}
                      className="font-medium text-accent break-words hover:underline"
                    >
                      {entry.property_title}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground break-words">
                      {entry.property_title}
                    </span>
                  )}
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
      <PropertyClientsModal state={clientsModal} property={clientsProperty} />
    </div>
  );
}
