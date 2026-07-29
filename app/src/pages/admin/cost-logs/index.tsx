import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Select, ListBox, Pagination, Table } from "@heroui/react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Routes } from "@/routes/routes";
import { useAdminUsers } from "@/features/users/hooks/use-admin-users";
import { useCostLogs } from "@/features/cost-logs/hooks/use-cost-logs";
import type {
  CostLogListQuery,
  CostOperationType,
  CostProvider,
} from "@/features/cost-logs/interfaces/cost-logs.interfaces";
import { CostOperationTypeFilterOptions } from "@/config/constants/dropdowns/cost-logs/cost-operation-type-filter.options";
import { CostProviderFilterOptions } from "@/config/constants/dropdowns/cost-logs/cost-provider-filter.options";
import { formatDateTime } from "@/lib/date";

function toStartOfDayIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

function formatUsd(value: string | null | undefined) {
  if (!value) return "$0.000000";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toFixed(6)}`;
}

function formatOperationLabel(operation: string) {
  return operation
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatQuantity(row: {
  operation_type: CostOperationType;
  input_quantity: number | null;
  output_quantity: number | null;
  unit_count: number | null;
}) {
  if (row.operation_type === "DEWATERMARK") {
    return row.unit_count !== null ? `${row.unit_count} image(s)` : "—";
  }
  if (row.operation_type === "TRANSLATION") {
    return row.input_quantity !== null ? `${row.input_quantity} chars` : "—";
  }
  if (row.input_quantity === null && row.output_quantity === null) return "—";
  return `${row.input_quantity ?? 0} in / ${row.output_quantity ?? 0} out tokens`;
}

export default function CostLogsListPage() {
  const navigate = useNavigate();

  const [operationType, setOperationType] = useState<CostOperationType | "all">("all");
  const [provider, setProvider] = useState<CostProvider | "all">("all");
  const [userId, setUserId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<CostLogListQuery>(
    () => ({
      page,
      limit: 20,
      ...(operationType !== "all" && { operation_type: operationType }),
      ...(provider !== "all" && { provider }),
      ...(userId !== "all" && { user_id: userId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, operationType, provider, userId, dateFrom, dateTo],
  );

  const { data, isPending } = useCostLogs(query);
  const { data: usersData } = useAdminUsers({ limit: 100 });

  const logs = data?.data ?? [];
  const pagination = data?.pagination;
  const users = usersData?.data ?? [];
  const byOperation = data?.by_operation ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Cost logs</p>
        <p className="text-sm text-muted">
          Billable operations across AI normalization, title generation, translation, and
          dewatermarking.
        </p>
      </div>

      <div className="flex items-stretch gap-3 flex-wrap">
        <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-2 w-fit">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Total cost (filtered)
          </p>
          <p className="font-mono text-3xl font-bold text-foreground">
            {isPending ? "—" : formatUsd(data?.total_cost)}
          </p>
        </div>
        {Object.entries(byOperation).map(([operation, cost]) => (
          <div
            key={operation}
            className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-2 w-fit"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {formatOperationLabel(operation)}
            </p>
            <p className="font-mono text-xl font-semibold text-foreground">{formatUsd(cost)}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select
          aria-label="Filter by operation"
          selectedKey={operationType}
          onSelectionChange={(key) => {
            setPage(1);
            setOperationType(key as CostOperationType | "all");
          }}
          className="w-52"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CostOperationTypeFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by provider"
          selectedKey={provider}
          onSelectionChange={(key) => {
            setPage(1);
            setProvider(key as CostProvider | "all");
          }}
          className="w-52"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CostProviderFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by user"
          selectedKey={userId}
          onSelectionChange={(key) => {
            setPage(1);
            setUserId(key as string | "all");
          }}
          className="w-56"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item key="all" id="all">
                All users
              </ListBox.Item>
              {users.map((user) => (
                <ListBox.Item key={user.id} id={user.id}>
                  {user.email}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <DatePickerField
          aria-label="From date"
          value={dateFrom}
          onChange={(next) => {
            setPage(1);
            setDateFrom(next);
          }}
        />
        <DatePickerField
          aria-label="To date"
          value={dateTo}
          onChange={(next) => {
            setPage(1);
            setDateTo(next);
          }}
        />
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={7} />
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No cost logs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Cost logs">
                <Table.Header>
                  <Table.Column isRowHeader>User</Table.Column>
                  <Table.Column>Operation</Table.Column>
                  <Table.Column>Provider</Table.Column>
                  <Table.Column>Model</Table.Column>
                  <Table.Column>Quantity</Table.Column>
                  <Table.Column>Cost</Table.Column>
                  <Table.Column>Date</Table.Column>
                </Table.Header>
                <Table.Body>
                  {logs.map((log) => (
                    <Table.Row
                      key={log.id}
                      id={log.id}
                      className={log.crawl_run_id ? "cursor-pointer" : undefined}
                      onAction={
                        log.crawl_run_id
                          ? () => navigate(Routes.admin.crawlRuns.detail(log.crawl_run_id!))
                          : undefined
                      }
                    >
                      <Table.Cell>
                        <span className="font-medium text-foreground">
                          {log.user?.email ?? "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{formatOperationLabel(log.operation_type)}</Table.Cell>
                      <Table.Cell>{log.provider}</Table.Cell>
                      <Table.Cell>{log.model ?? "—"}</Table.Cell>
                      <Table.Cell>
                        <span className="text-xs text-muted font-mono">
                          {formatQuantity(log)}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-sm text-foreground">
                          {formatUsd(log.total_cost)}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(log.created_at)}</Table.Cell>
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
                Page {pagination.page} of {pagination.total_pages}
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
    </div>
  );
}
