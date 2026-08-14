import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Checkbox,
  Chip,
  Pagination,
  Select,
  ListBox,
  Table,
  useOverlayState,
  type Selection,
} from "@heroui/react";
import { Layers, Merge, Scissors, Trash2, Ungroup } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { ClearableSearchInput } from "@/components/ui/clearable-search-input";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TruncateDescriptionDialog } from "@/components/ui/truncate-description-dialog";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import { PropertyDuplicateGroupChip } from "@/components/ui/property-duplicate-group-chip";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import {
  useDeleteProperties,
  useDeleteProperty,
  useDedupePropertyGroups,
  useMergeProperties,
  useProperties,
  usePropertiesCount,
  useSplitProperties,
  useTruncatePropertyDescriptions,
} from "@/features/properties/hooks/use-properties";
import {
  PropertyStatuses,
  type ListingType,
  type PropertyCountQuery,
  type PropertyListQuery,
  type PropertyStatus,
  type PropertyType,
} from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFilterOptions } from "@/config/constants/dropdowns/properties/property-status-filter.options";
import { PropertySortByOptions } from "@/config/constants/dropdowns/properties/property-sort-by.options";
import { ListingTypeFilterOptions } from "@/config/constants/dropdowns/properties/listing-type-filter.options";
import { PropertyTypeFilterOptions } from "@/config/constants/dropdowns/properties/property-type-filter.options";
import { PropertyDuplicateGroupFilterOptions } from "@/config/constants/dropdowns/properties/property-duplicate-group-filter.options";
import { OrderDirectionOptions } from "@/config/constants/dropdowns/shared/order-direction.options";
import { TablePageSizeOptions } from "@/config/constants/dropdowns/shared/table-page-size.options";
import {
  OrderBy,
  OrderDirection,
  type OrderBy as OrderByType,
  type OrderDirection as OrderDirectionType,
} from "@/interfaces/filters/filters.interface";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { formatPrice } from "@/lib/price";
import { toEndOfDayIso, toStartOfDayIso } from "@/lib/date";
import { getDuplicateGroupRowClasses } from "@/lib/duplicate-group-color.utils";
import { getDuplicateGroupDedupePlan } from "@/lib/duplicate-group-dedupe.utils";
import { cn } from "@/lib/utils";

const PROPERTY_DELETE_ACTIONS: TableRowAction[] = [
  { id: "delete", label: "Delete", variant: "danger", icon: Trash2 },
];

export function PropertiesListPanel() {
  const mergeConfirm = useOverlayState();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();
  const dedupeConfirm = useOverlayState();
  const truncateConfirm = useOverlayState();
  const splitConfirm = useOverlayState();

  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [listingType, setListingType] = useState<ListingType | "all">("all");
  const [propertyType, setPropertyType] = useState<PropertyType | "all">("all");
  const [search, setSearch] = useState("");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [duplicateGroup, setDuplicateGroup] = useState<"all" | "true" | "false">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [orderBy, setOrderBy] = useState<OrderByType>(OrderBy.UPDATED_AT);
  const [orderDirection, setOrderDirection] = useState<OrderDirectionType>(
    OrderDirection.DESC,
  );
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [deletePropertyId, setDeletePropertyId] = useState<string | null>(null);

  const query = useMemo<PropertyListQuery>(
    () => ({
      page,
      limit,
      ...(status !== "all" && { status }),
      ...(listingType !== "all" && { listing_type: listingType }),
      ...(propertyType !== "all" && { property_type: propertyType }),
      ...(search.trim() && { search: search.trim() }),
      ...(agencyId !== "all" && { agency_id: agencyId }),
      ...(duplicateGroup !== "all" && {
        has_duplicate_group: duplicateGroup === "true",
      }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
      order_by: orderBy,
      order_direction: orderDirection,
    }),
    [
      page,
      limit,
      status,
      listingType,
      propertyType,
      search,
      agencyId,
      duplicateGroup,
      dateFrom,
      dateTo,
      orderBy,
      orderDirection,
    ],
  );

  const countQuery = useMemo<PropertyCountQuery>(() => {
    const { page: _page, limit: _limit, ...filters } = query;
    return filters;
  }, [query]);

  const { data, isPending } = useProperties(query);
  const { data: countData } = usePropertiesCount(countQuery);
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const mergeProperties = useMergeProperties();
  const deleteProperty = useDeleteProperty();
  const deleteProperties = useDeleteProperties();
  const dedupePropertyGroups = useDedupePropertyGroups();
  const splitProperties = useSplitProperties();
  const truncateDescriptions = useTruncatePropertyDescriptions();

  const properties = data?.data ?? [];
  const pagination = data?.pagination;
  const total = countData?.total;
  const agencies = agenciesData?.data ?? [];
  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") {
      return new Set(properties.map((property) => property.id));
    }
    return new Set([...selectedKeys].map(String));
  }, [selectedKeys, properties]);
  const selectedCount = selectedIds.size;
  const selectedGroupedCount = properties.filter(
    (property) => selectedIds.has(property.id) && property.duplicate_group_id,
  ).length;

  const dedupePlan = useMemo(
    () => getDuplicateGroupDedupePlan(properties, selectedIds),
    [properties, selectedIds],
  );
  const dedupeDeleteCount = dedupePlan.deleteIds.length;

  const bulkActions = useMemo<TableRowAction[]>(() => {
    const actions: TableRowAction[] = [
      {
        id: "truncate",
        label: "Truncate text",
        icon: Scissors,
        isDisabled: selectedCount < 1,
      },
      {
        id: "split",
        label: "Split from group",
        icon: Ungroup,
        isDisabled: selectedGroupedCount < 1,
      },
      {
        id: "merge",
        label: "Merge selected",
        icon: Merge,
        isDisabled: selectedCount < 2,
      },
      {
        id: "delete",
        label: "Delete selected",
        variant: "danger",
        icon: Trash2,
        isDisabled: selectedCount < 1,
      },
    ];

    if (duplicateGroup === "true") {
      actions.unshift({
        id: "dedupe",
        label: "Keep one per group",
        icon: Layers,
        isDisabled: dedupeDeleteCount < 1,
      });
    }

    return actions;
  }, [dedupeDeleteCount, duplicateGroup, selectedCount, selectedGroupedCount]);

  const clearSelection = () => setSelectedKeys(new Set());

  const handleBulkAction = (actionId: string) => {
    if (actionId === "truncate") {
      truncateConfirm.open();
      return;
    }
    if (actionId === "split") {
      splitConfirm.open();
      return;
    }
    if (actionId === "merge") {
      mergeConfirm.open();
      return;
    }
    if (actionId === "dedupe") {
      dedupeConfirm.open();
      return;
    }
    if (actionId === "delete") {
      bulkDeleteConfirm.open();
    }
  };

  const handleMerge = async () => {
    await mergeProperties.mutateAsync({ property_ids: Array.from(selectedIds) });
    clearSelection();
  };

  const handleDelete = async () => {
    if (!deletePropertyId) return;
    await deleteProperty.mutateAsync(deletePropertyId);
    setSelectedKeys((prev) => {
      if (prev === "all") {
        return new Set(
          properties.map((property) => property.id).filter((id) => id !== deletePropertyId),
        );
      }
      const next = new Set(prev);
      next.delete(deletePropertyId);
      return next;
    });
    setDeletePropertyId(null);
  };

  const handleBulkDelete = async () => {
    await deleteProperties.mutateAsync({ property_ids: Array.from(selectedIds) });
    clearSelection();
  };

  const handleDedupeGroups = async () => {
    await dedupePropertyGroups.mutateAsync({
      property_ids: Array.from(selectedIds),
    });
    clearSelection();
  };

  const handleSplitFromGroup = async () => {
    await splitProperties.mutateAsync({
      property_ids: Array.from(selectedIds),
    });
    clearSelection();
  };

  const handleTruncateDescriptions = async ({
    texts,
    replacement,
  }: {
    texts: string[];
    replacement?: string;
  }) => {
    await truncateDescriptions.mutateAsync({
      property_ids: Array.from(selectedIds),
      texts,
      ...(replacement ? { replacement } : {}),
    });
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Properties</p>
          <p className="text-sm text-muted">
            Normalized listings from crawl runs
            {total != null && (
              <>
                {" "}
                · {total.toLocaleString()} {total === 1 ? "property" : "properties"}
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
        <ClearableSearchInput
          placeholder="Search property id, internal id, CRM id, title, or city…"
          value={search}
          onValueChange={(next) => {
            setPage(1);
            setSearch(next);
          }}
          className="w-72"
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
          aria-label="Sort by"
          selectedKey={orderBy}
          onSelectionChange={(key) => {
            setPage(1);
            setOrderBy(key as OrderByType);
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {PropertySortByOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          aria-label="Sort order"
          selectedKey={orderDirection}
          onSelectionChange={(key) => {
            setPage(1);
            setOrderDirection(key as OrderDirectionType);
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {OrderDirectionOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          aria-label="Filter by listing type"
          selectedKey={listingType}
          onSelectionChange={(key) => {
            setPage(1);
            setListingType(key as ListingType | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {ListingTypeFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          aria-label="Filter by property type"
          selectedKey={propertyType}
          onSelectionChange={(key) => {
            setPage(1);
            setPropertyType(key as PropertyType | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {PropertyTypeFilterOptions.map((option) => (
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
        <Select
          aria-label="Filter by duplicate group"
          selectedKey={duplicateGroup}
          onSelectionChange={(key) => {
            setPage(1);
            setDuplicateGroup(key as "all" | "true" | "false");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {PropertyDuplicateGroupFilterOptions.map((option) => (
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
      ) : properties.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No properties found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Properties"
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              >
                <Table.Header>
                  <Table.Column className="pr-0">
                    <Checkbox aria-label="Select all properties on this page" slot="selection">
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Column>
                  <Table.Column isRowHeader>Title</Table.Column>
                  <Table.Column isRowHeader>Agency</Table.Column>
                  <Table.Column isRowHeader>City</Table.Column>
                  <Table.Column isRowHeader>Price</Table.Column>
                  <Table.Column isRowHeader>Listing</Table.Column>
                  <Table.Column isRowHeader>Type</Table.Column>
                  <Table.Column isRowHeader>Status</Table.Column>
                  <Table.Column isRowHeader>Group</Table.Column>
                  <Table.Column isRowHeader>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {properties.map((property) => {
                    const isRemoved = property.status === PropertyStatuses.REMOVED;
                    const groupCellClass = cn(
                      property.duplicate_group_id
                        ? getDuplicateGroupRowClasses(property.duplicate_group_id)
                        : undefined,
                      isRemoved && "opacity-60",
                    );

                    return (
                    <Table.Row key={property.id} id={property.id}>
                      <Table.Cell className={cn("pr-0", groupCellClass)}>
                        <Checkbox
                          aria-label={`Select ${property.title}`}
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
                      <Table.Cell className={groupCellClass}>
                        <Link
                          to={Routes.admin.properties.detail(property.id)}
                          className={cn(
                            "text-left text-foreground hover:text-accent transition-colors font-medium",
                            isRemoved && "line-through",
                          )}
                        >
                          {property.title}
                        </Link>
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        {property.agency_name ?? "—"}
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>{property.city ?? "—"}</Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        {formatPrice(property.price, property.currency)}
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        <Chip size="sm" variant="soft">
                          <Chip.Label>{property.listing_type.replace(/_/g, " ")}</Chip.Label>
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        <Chip size="sm" variant="soft">
                          <Chip.Label>{property.property_type.replace(/_/g, " ")}</Chip.Label>
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        <PropertyStatusChip status={property.status} />
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        {property.duplicate_group_id ? (
                          <PropertyDuplicateGroupChip groupId={property.duplicate_group_id} />
                        ) : (
                          "—"
                        )}
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        <TableRowActionsMenu
                          actions={PROPERTY_DELETE_ACTIONS}
                          onAction={(actionId) => {
                            if (actionId !== "delete") return;
                            setDeletePropertyId(property.id);
                            deleteConfirm.open();
                          }}
                          ariaLabel={`Actions for ${property.title}`}
                        />
                      </Table.Cell>
                    </Table.Row>
                    );
                  })}
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
        state={mergeConfirm}
        title="Merge selected properties?"
        description={`This will assign a shared duplicate group to ${selectedCount} properties.`}
        confirmLabel="Merge"
        onConfirm={handleMerge}
        isPending={mergeProperties.isPending}
      />

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete this property?"
        description="This cannot be undone. Related user copies and history will also be removed."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteProperty.isPending}
      />

      <ConfirmationDialog
        state={bulkDeleteConfirm}
        title="Delete selected properties?"
        description={`This will permanently delete ${selectedCount} properties. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isPending={deleteProperties.isPending}
      />

      <ConfirmationDialog
        state={dedupeConfirm}
        title="Keep one property per group?"
        description={`This will delete ${dedupeDeleteCount} duplicate ${dedupeDeleteCount === 1 ? "property" : "properties"} and keep one from each selected group.`}
        confirmLabel="Keep one"
        onConfirm={handleDedupeGroups}
        isPending={dedupePropertyGroups.isPending}
      />

      <ConfirmationDialog
        state={splitConfirm}
        title="Split from duplicate group?"
        description={`This will remove ${selectedGroupedCount} ${selectedGroupedCount === 1 ? "property" : "properties"} from their duplicate groups. Other grouped properties stay linked.`}
        confirmLabel="Split"
        onConfirm={handleSplitFromGroup}
        isPending={splitProperties.isPending}
      />

      <TruncateDescriptionDialog
        state={truncateConfirm}
        propertyCount={selectedCount}
        onConfirm={handleTruncateDescriptions}
        isPending={truncateDescriptions.isPending}
      />
    </div>
  );
}
