import { useMemo, useState } from "react";
import { Select, ListBox, Pagination, Table } from "@heroui/react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useUserCostLogs } from "@/features/cost-logs/hooks/use-cost-logs";
import type {
  CostLogListQuery,
  CostLogOperationQuantity,
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

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
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

function formatOperationQuantityLine(
  operation: string,
  quantity: CostLogOperationQuantity | undefined,
) {
  if (!quantity) return null;
  if (operation === "DEWATERMARK") {
    return quantity.unit_count ? `${formatNumber(quantity.unit_count)} image(s)` : null;
  }
  if (operation === "TRANSLATION") {
    return quantity.input_quantity ? `${formatNumber(quantity.input_quantity)} chars` : null;
  }
  if (operation === "NORMALIZATION" || operation === "TITLE_GENERATION") {
    if (!quantity.input_quantity && !quantity.output_quantity) return null;
    return `${formatNumber(quantity.input_quantity)} in / ${formatNumber(quantity.output_quantity)} out tokens`;
  }
  return null;
}

export default function DashboardCostLogsPage() {
  const [operationType, setOperationType] = useState<CostOperationType | "all">("all");
  const [provider, setProvider] = useState<CostProvider | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<Omit<CostLogListQuery, "user_id">>(
    () => ({
      page,
      limit: 20,
      ...(operationType !== "all" && { operation_type: operationType }),
      ...(provider !== "all" && { provider }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, operationType, provider, dateFrom, dateTo],
  );

  const { data, isPending } = useUserCostLogs(query);

  const logs = data?.data ?? [];
  const pagination = data?.pagination;
  const byOperation = data?.by_operation ?? {};
  const quantityByOperation = data?.quantity_by_operation ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Cost logs</p>
        <p className="text-sm text-muted">
          Your billable operations across AI normalization, title generation, translation, and
          dewatermarking.
        </p>
      </div>

      <div className="flex items-stretch gap-3 flex-wrap">
        <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-2 w-fit">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Total cost
          </p>
          <p className="font-mono text-3xl font-bold text-foreground">
            {isPending ? "—" : formatUsd(data?.total_cost)}
          </p>
        </div>
        {Object.entries(byOperation).map(([operation, cost]) => {
          const quantityLine = formatOperationQuantityLine(
            operation,
            quantityByOperation[operation],
          );
          return (
            <div
              key={operation}
              className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-2 w-fit"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {formatOperationLabel(operation)}
              </p>
              <p className="font-mono text-xl font-semibold text-foreground">{formatUsd(cost)}</p>
              {quantityLine && <p className="text-xs text-muted">{quantityLine}</p>}
            </div>
          );
        })}
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
        <TableSkeleton rows={8} columns={6} />
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
                  <Table.Column isRowHeader>Operation</Table.Column>
                  <Table.Column>Provider</Table.Column>
                  <Table.Column>Model</Table.Column>
                  <Table.Column>Quantity</Table.Column>
                  <Table.Column>Cost</Table.Column>
                  <Table.Column>Date</Table.Column>
                </Table.Header>
                <Table.Body>
                  {logs.map((log) => (
                    <Table.Row key={log.id} id={log.id}>
                      <Table.Cell>
                        <span className="font-medium text-foreground">
                          {formatOperationLabel(log.operation_type)}
                        </span>
                      </Table.Cell>
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
