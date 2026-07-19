import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Checkbox,
  Chip,
  Input,
  Pagination,
  Select,
  ListBox,
  Table,
  useOverlayState,
  type Selection,
} from "@heroui/react";
import { Trash2 } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import {
  useDeleteSourceProperties,
  useDeleteSourceProperty,
  useSourceProperties,
  useSourcePropertiesCount,
} from "@/features/source-properties/hooks/use-source-properties";
import type {
  SourcePropertyCountQuery,
  SourcePropertyListQuery,
} from "@/features/source-properties/interfaces/source-properties.interfaces";
import type { PropertyStatus } from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFilterOptions } from "@/config/constants/dropdowns/property-status-filter.options";
import { TablePageSizeOptions } from "@/config/constants/dropdowns/table-page-size.options";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { formatDateTime, toEndOfDayIso, toStartOfDayIso } from "@/lib/date";

const SOURCE_PROPERTY_DELETE_ACTIONS: TableRowAction[] = [
  { id: "delete", label: "Delete", variant: "danger", icon: Trash2 },
];

export function SourcePropertiesListPanel() {
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();

  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [deleteSourcePropertyId, setDeleteSourcePropertyId] = useState<
    string | null
  >(null);

  const query = useMemo<SourcePropertyListQuery>(
    () => ({
      page,
      limit,
      ...(status !== "all" && { status }),
      ...(search.trim() && { search: search.trim() }),
      ...(agencyId !== "all" && { agency_id: agencyId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, limit, status, search, agencyId, dateFrom, dateTo],
  );

  const countQuery = useMemo<SourcePropertyCountQuery>(() => {
    const { page: _page, limit: _limit, ...filters } = query;
    return filters;
  }, [query]);

  const { data, isPending } = useSourceProperties(query);
  const { data: countData } = useSourcePropertiesCount(countQuery);
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const deleteSourceProperty = useDeleteSourceProperty();
  const deleteSourceProperties = useDeleteSourceProperties();

  const sourceProperties = data?.data ?? [];
  const pagination = data?.pagination;
  const total = countData?.total;
  const agencies = agenciesData?.data ?? [];
  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") {
      return new Set(sourceProperties.map((item) => item.id));
    }
    return new Set([...selectedKeys].map(String));
  }, [selectedKeys, sourceProperties]);
  const selectedCount = selectedIds.size;

  const bulkActions = useMemo<TableRowAction[]>(
    () => [
      {
        id: "delete",
        label: "Delete selected",
        variant: "danger",
        icon: Trash2,
        isDisabled: selectedCount < 1,
      },
    ],
    [selectedCount],
  );

  const clearSelection = () => setSelectedKeys(new Set());

  const handleBulkAction = (actionId: string) => {
    if (actionId === "delete") {
      bulkDeleteConfirm.open();
    }
  };

  const handleDelete = async () => {
    if (!deleteSourcePropertyId) return;
    await deleteSourceProperty.mutateAsync(deleteSourcePropertyId);
    setSelectedKeys((prev) => {
      if (prev === "all") {
        return new Set(
          sourceProperties
            .map((item) => item.id)
            .filter((id) => id !== deleteSourcePropertyId),
        );
      }
      const next = new Set(prev);
      next.delete(deleteSourcePropertyId);
      return next;
    });
    setDeleteSourcePropertyId(null);
  };

  const handleBulkDelete = async () => {
    await deleteSourceProperties.mutateAsync({
      source_property_ids: Array.from(selectedIds),
    });
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            Source properties
          </p>
          <p className="text-sm text-muted">
            Raw listings from agency crawl runs
            {total != null && (
              <>
                {" "}
                · {total.toLocaleString()}{" "}
                {total === 1 ? "source property" : "source properties"}
              </>
            )}
          </p>
        </div>
        <BulkActionsMenu
          label={selectedCount > 0 ? `Actions (${selectedCount})` : "Actions"}
          actions={bulkActions}
          onAction={handleBulkAction}
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search id, title, location, or url…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="w-64"
        />
        <Select
          aria-label="Filter by status"
          selectedKey={status}
          onSelectionChange={(key) => {
            setPage(1);
            setStatus(key as PropertyStatus | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {PropertyStatusFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          aria-label="Filter by agency"
          selectedKey={agencyId}
          onSelectionChange={(key) => {
            setPage(1);
            setAgencyId(key as string | "all");
          }}
          className="w-48"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item key="all" id="all">
                All agencies
              </ListBox.Item>
              {agencies.map((agency) => (
                <ListBox.Item key={agency.id} id={agency.id}>
                  {agency.name}
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
        <Select
          aria-label="Rows per page"
          selectedKey={
            TablePageSizeOptions.find((option) => option.value === limit)?.id ??
            String(limit)
          }
          onSelectionChange={(key) => {
            setPage(1);
            const option = TablePageSizeOptions.find(
              (item) => item.id === String(key),
            );
            setLimit(option?.value ?? 20);
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {TablePageSizeOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {isPending ? (
        <TableSkeleton rows={10} />
      ) : sourceProperties.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No source properties found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Source properties"
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              >
                <Table.Header>
                  <Table.Column className="pr-0">
                    <Checkbox
                      aria-label="Select all source properties on this page"
                      slot="selection"
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Column>
                  <Table.Column isRowHeader>Title</Table.Column>
                  <Table.Column isRowHeader>Agency</Table.Column>
                  <Table.Column isRowHeader>Location</Table.Column>
                  <Table.Column isRowHeader>Price</Table.Column>
                  <Table.Column isRowHeader>Status</Table.Column>
                  <Table.Column isRowHeader>Links</Table.Column>
                  <Table.Column isRowHeader>Last seen</Table.Column>
                  <Table.Column isRowHeader>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {sourceProperties.map((sourceProperty) => (
                    <Table.Row key={sourceProperty.id} id={sourceProperty.id}>
                      <Table.Cell className="pr-0">
                        <Checkbox
                          aria-label={`Select ${sourceProperty.raw_title ?? sourceProperty.property_id}`}
                          slot="selection"
                          variant="secondary"
                        >
                          <Checkbox.Content>
                            <Checkbox.Control>
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                          </Checkbox.Content>
                        </Checkbox>
                      </Table.Cell>
                      <Table.Cell>
                        <button
                          type="button"
                          className="text-left text-foreground hover:text-accent transition-colors font-medium"
                          onClick={() =>
                            navigate(
                              Routes.admin.properties.sourceDetail(
                                sourceProperty.id,
                              ),
                            )
                          }
                        >
                          {sourceProperty.raw_title?.trim() ||
                            sourceProperty.property_id}
                        </button>
                      </Table.Cell>
                      <Table.Cell>
                        {sourceProperty.source_agency.name}
                      </Table.Cell>
                      <Table.Cell>
                        {sourceProperty.raw_location ?? "—"}
                      </Table.Cell>
                      <Table.Cell>
                        {sourceProperty.raw_price ?? "—"}
                      </Table.Cell>
                      <Table.Cell>
                        <PropertyStatusChip status={sourceProperty.status} />
                      </Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" variant="soft">
                          <Chip.Label>
                            {sourceProperty.linked_property_count}
                          </Chip.Label>
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        {sourceProperty.last_seen_at
                          ? formatDateTime(sourceProperty.last_seen_at)
                          : "—"}
                      </Table.Cell>
                      <Table.Cell>
                        <TableRowActionsMenu
                          actions={SOURCE_PROPERTY_DELETE_ACTIONS}
                          onAction={(actionId) => {
                            if (actionId !== "delete") return;
                            setDeleteSourcePropertyId(sourceProperty.id);
                            deleteConfirm.open();
                          }}
                          ariaLabel={`Actions for ${sourceProperty.raw_title ?? sourceProperty.property_id}`}
                        />
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

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete this source property?"
        description="This cannot be undone. Linked property source mappings will also be removed."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteSourceProperty.isPending}
      />

      <ConfirmationDialog
        state={bulkDeleteConfirm}
        title="Delete selected source properties?"
        description={`This will permanently delete ${selectedCount} source ${selectedCount === 1 ? "property" : "properties"}. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isPending={deleteSourceProperties.isPending}
      />
    </div>
  );
}
