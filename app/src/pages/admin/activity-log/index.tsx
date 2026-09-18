import { useMemo, useState } from "react";
import { ListBox, Pagination, Select, Table, useOverlayState } from "@heroui/react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useActivityLogFacets, useActivityLogs } from "@/features/activity-logs/hooks/use-activity-logs";
import type {
  ActivityLogListQuery,
  ActivityOutcome,
} from "@/features/activity-logs/interfaces/activity-logs.interfaces";
import { useAdminUsers } from "@/features/users/hooks/use-admin-users";
import { ActivityOutcomeFilterOptions } from "@/config/constants/dropdowns/activity-log/activity-outcome-filter.options";
import { formatDateTime, toEndOfDayIso, toStartOfDayIso } from "@/lib/date";
import { ActivityOutcomeChip, ImpersonatedChip } from "./components/activity-badges";
import { ActivityLogDetailModal } from "./components/activity-log-detail-modal";

type FilterSelectProps = {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
};

function FilterSelect({ label, value, options, onChange, className = "w-52" }: FilterSelectProps) {
  return (
    <Select
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
      className={className}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id}>
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

const withAll = (allLabel: string, values: string[] = []) => [
  { id: "all", label: allLabel },
  ...values.map((value) => ({ id: value, label: value })),
];

export default function ActivityLogPage() {
  const detailModal = useOverlayState();
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const [category, setCategory] = useState("all");
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [outcome, setOutcome] = useState<ActivityOutcome | "all">("all");
  const [userId, setUserId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<ActivityLogListQuery>(
    () => ({
      page,
      limit: 20,
      ...(category !== "all" && { category }),
      ...(action !== "all" && { action }),
      ...(entityType !== "all" && { entity_type: entityType }),
      ...(outcome !== "all" && { outcome }),
      ...(userId !== "all" && { user_id: userId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, category, action, entityType, outcome, userId, dateFrom, dateTo],
  );

  const { data, isPending } = useActivityLogs(query);
  const { data: facets } = useActivityLogFacets();
  const { data: usersData } = useAdminUsers({ limit: 100 });

  const logs = data?.data ?? [];
  const pagination = data?.pagination;

  const userOptions = useMemo(
    () => [
      { id: "all", label: "All users" },
      ...(usersData?.data ?? []).map((user) => ({ id: user.id, label: user.email })),
    ],
    [usersData],
  );

  // Changing any filter returns to the first page.
  const filter =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setPage(1);
      setter(value);
    };

  const openLog = (id: string) => {
    setSelectedLogId(id);
    detailModal.open();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Activity log</p>
        <p className="text-sm text-muted">
          Every data-changing action taken in the app, with who did it and the before/after values.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Filter by category"
          value={category}
          options={withAll("All categories", facets?.categories)}
          onChange={filter(setCategory)}
        />
        <FilterSelect
          label="Filter by action"
          value={action}
          options={withAll("All actions", facets?.actions)}
          onChange={filter(setAction)}
          className="w-64"
        />
        <FilterSelect
          label="Filter by entity type"
          value={entityType}
          options={withAll("All entity types", facets?.entity_types)}
          onChange={filter(setEntityType)}
        />
        <FilterSelect
          label="Filter by outcome"
          value={outcome}
          options={ActivityOutcomeFilterOptions}
          onChange={filter((value: string) => setOutcome(value as ActivityOutcome | "all"))}
          className="w-44"
        />
        <FilterSelect
          label="Filter by user"
          value={userId}
          options={userOptions}
          onChange={filter(setUserId)}
          className="w-56"
        />
        <DatePickerField aria-label="From date" value={dateFrom} onChange={filter(setDateFrom)} />
        <DatePickerField aria-label="To date" value={dateTo} onChange={filter(setDateTo)} />
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={6} />
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No activity found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Activity log">
                <Table.Header>
                  <Table.Column isRowHeader>When</Table.Column>
                  <Table.Column>Who</Table.Column>
                  <Table.Column>Action</Table.Column>
                  <Table.Column>Changes</Table.Column>
                  <Table.Column>Page</Table.Column>
                  <Table.Column>Outcome</Table.Column>
                </Table.Header>
                <Table.Body>
                  {logs.map((log) => (
                    <Table.Row
                      key={log.id}
                      id={log.id}
                      className="cursor-pointer"
                      onAction={() => openLog(log.id)}
                    >
                      <Table.Cell>
                        <span className="whitespace-nowrap">{formatDateTime(log.created_at)}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-medium text-foreground">
                            {log.actor_email ?? "Anonymous"}
                          </span>
                          {log.is_impersonated && <ImpersonatedChip />}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-col">
                          <span className="font-mono text-sm text-foreground">{log.action}</span>
                          <span className="font-mono text-xs text-muted">
                            {log.method} {log.route}
                          </span>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-xs text-muted">
                          {log._count.changes > 0
                            ? `${log.affected_count.toLocaleString()} ${log.affected_count === 1 ? "entity" : "entities"}`
                            : "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-xs text-muted">{log.client_route ?? "—"}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <ActivityOutcomeChip outcome={log.outcome} statusCode={log.status_code} />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <Pagination>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                isDisabled={!pagination.has_prev}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Summary>
                Page {pagination.page} of {pagination.total_pages} · {pagination.total.toLocaleString()} entries
              </Pagination.Summary>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next
                isDisabled={!pagination.has_next}
                onPress={() => setPage((p) => p + 1)}
              >
                Next
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      )}

      <ActivityLogDetailModal state={detailModal} logId={selectedLogId} />
    </div>
  );
}
