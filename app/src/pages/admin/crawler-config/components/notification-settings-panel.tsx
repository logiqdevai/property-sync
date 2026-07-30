import { useMemo, useState } from "react";
import { ListBox, Select, Switch, Table, Tabs } from "@heroui/react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  useNotificationSettings,
  useUpdateNotificationSetting,
} from "@/features/notification-settings/hooks/use-notification-settings";
import type { NotificationSetting } from "@/features/notification-settings/interfaces/notification-settings.interfaces";
import type { NotificationType } from "@/features/notifications/interfaces/notifications.interfaces";
import { getNotificationTypeLabel } from "@/config/constants/dropdowns/notifications/notification-type-filter.options";
import { NotificationSeverityFilterOptions } from "@/config/constants/dropdowns/notifications/notification-severity-filter.options";
import {
  NotificationCategoryLabels,
  NotificationCategoryOrder,
  NotificationTypeCategory,
} from "@/config/constants/dropdowns/notifications/notification-type-category.options";

const CATEGORY_TABS = ["all", ...NotificationCategoryOrder] as const;
type CategoryTab = (typeof CATEGORY_TABS)[number];

const SEVERITY_OPTIONS = NotificationSeverityFilterOptions.filter((option) => option.id !== "all");

const STATUS_FILTER_OPTIONS = [
  { id: "all", label: "All statuses" },
  { id: "enabled", label: "Enabled" },
  { id: "disabled", label: "Disabled" },
] as const;
type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number]["id"];

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never customized";
}

export function NotificationSettingsPanel() {
  const [category, setCategory] = useState<CategoryTab>("all");
  const [severityFilter, setSeverityFilter] = useState<NotificationSetting["min_severity"] | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isPending } = useNotificationSettings();
  const updateSetting = useUpdateNotificationSetting();

  const settings = data ?? [];

  const filtered = useMemo(() => {
    return settings.filter((setting) => {
      if (category !== "all" && NotificationTypeCategory[setting.type] !== category) return false;
      if (severityFilter !== "all" && setting.min_severity !== severityFilter) return false;
      if (statusFilter === "enabled" && !setting.enabled) return false;
      if (statusFilter === "disabled" && setting.enabled) return false;
      return true;
    });
  }, [settings, category, severityFilter, statusFilter]);

  return (
    <section className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Alerting preferences</h2>
        <p className="text-sm text-muted mt-1">
          Choose which notification types are forwarded to alerting channels (e.g. Telegram) and the
          minimum severity required to trigger a send. This does not affect the in-app notification log,
          which always records every notification.
        </p>
      </div>

      <Tabs
        className="relative w-full"
        variant="secondary"
        selectedKey={category}
        onSelectionChange={(key) => setCategory(key as CategoryTab)}
      >
        <Tabs.ListContainer className="relative z-10">
          <Tabs.List aria-label="Notification category">
            <Tabs.Tab id="all">
              All
              <Tabs.Indicator />
            </Tabs.Tab>
            {NotificationCategoryOrder.map((cat) => (
              <Tabs.Tab key={cat} id={cat}>
                {NotificationCategoryLabels[cat]}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id={category} className="pt-4 data-[exiting]:pointer-events-none">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                aria-label="Filter by minimum severity"
                selectedKey={severityFilter}
                onSelectionChange={(key) =>
                  setSeverityFilter(key as NotificationSetting["min_severity"] | "all")
                }
                className="w-48"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {[{ id: "all", label: "All thresholds" }, ...SEVERITY_OPTIONS].map((option) => (
                      <ListBox.Item key={option.id} id={option.id}>
                        {option.label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              <Select
                aria-label="Filter by status"
                selectedKey={statusFilter}
                onSelectionChange={(key) => setStatusFilter(key as StatusFilter)}
                className="w-40"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <ListBox.Item key={option.id} id={option.id}>
                        {option.label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>

            {isPending ? (
              <TableSkeleton rows={6} columns={4} />
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
                No notification types match these filters.
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Notification settings">
                      <Table.Header>
                        <Table.Column isRowHeader>Type</Table.Column>
                        <Table.Column>Minimum severity</Table.Column>
                        <Table.Column>Last updated</Table.Column>
                        <Table.Column>Enabled</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {filtered.map((setting) => (
                          <Table.Row key={setting.type} id={setting.type}>
                            <Table.Cell>{getNotificationTypeLabel(setting.type)}</Table.Cell>
                            <Table.Cell>
                              <Select
                                aria-label={`Minimum severity for ${getNotificationTypeLabel(setting.type)}`}
                                selectedKey={setting.min_severity}
                                isDisabled={updateSetting.isPending}
                                onSelectionChange={(key) =>
                                  updateSetting.mutate({
                                    type: setting.type as NotificationType,
                                    payload: { min_severity: key as NotificationSetting["min_severity"] },
                                  })
                                }
                                className="w-36"
                              >
                                <Select.Trigger>
                                  <Select.Value />
                                  <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                  <ListBox>
                                    {SEVERITY_OPTIONS.map((option) => (
                                      <ListBox.Item key={option.id} id={option.id}>
                                        {option.label}
                                      </ListBox.Item>
                                    ))}
                                  </ListBox>
                                </Select.Popover>
                              </Select>
                            </Table.Cell>
                            <Table.Cell className="text-sm text-muted whitespace-nowrap">
                              {formatTimestamp(setting.updated_at)}
                            </Table.Cell>
                            <Table.Cell>
                              <Switch
                                isSelected={setting.enabled}
                                isDisabled={updateSetting.isPending}
                                onChange={(next) =>
                                  updateSetting.mutate({
                                    type: setting.type as NotificationType,
                                    payload: { enabled: next },
                                  })
                                }
                              >
                                <Switch.Control>
                                  <Switch.Thumb />
                                </Switch.Control>
                              </Switch>
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              </div>
            )}
          </div>
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
