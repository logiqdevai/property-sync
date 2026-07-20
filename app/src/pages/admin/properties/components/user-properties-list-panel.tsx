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
import { Layers, Scissors, Trash2, Ungroup } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DatePickerField } from "@/components/ui/date-picker-field";
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
  useAdminUserProperties,
  useAdminUserPropertiesCount,
  useDeleteAdminUserProperties,
  useDeleteAdminUserProperty,
  useDedupeAdminUserPropertyGroups,
  useSplitAdminUserProperties,
  useTruncateAdminUserPropertyDescriptions,
} from "@/features/user-properties/hooks/use-user-properties";
import type {
  AdminUserPropertyCountQuery,
  AdminUserPropertyListQuery,
} from "@/features/user-properties/interfaces/user-properties.interfaces";
import type {
  ListingType,
  PropertyStatus,
  PropertyType,
} from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFilterOptions } from "@/config/constants/dropdowns/property-status-filter.options";
import { ListingTypeFilterOptions } from "@/config/constants/dropdowns/listing-type-filter.options";
import { PropertyTypeFilterOptions } from "@/config/constants/dropdowns/property-type-filter.options";
import { PropertyDuplicateGroupFilterOptions } from "@/config/constants/dropdowns/property-duplicate-group-filter.options";
import { PropertyCrmPushFilterOptions } from "@/config/constants/dropdowns/property-crm-push-filter.options";
import { PropertyPendingCrmUpdateFilterOptions } from "@/config/constants/dropdowns/property-pending-crm-update-filter.options";
import { TablePageSizeOptions } from "@/config/constants/dropdowns/table-page-size.options";
import { useAdminUsers } from "@/features/users/hooks/use-admin-users";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { formatPrice } from "@/lib/price";
import { toEndOfDayIso, toStartOfDayIso } from "@/lib/date";
import { getDuplicateGroupRowClasses } from "@/lib/duplicate-group-color.utils";
import { getDuplicateGroupDedupePlan } from "@/lib/duplicate-group-dedupe.utils";
import { cn } from "@/lib/utils";

const USER_PROPERTY_DELETE_ACTIONS: TableRowAction[] = [
  { id: "delete", label: "Delete", variant: "danger", icon: Trash2 },
];

export function UserPropertiesListPanel() {
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();
  const dedupeConfirm = useOverlayState();
  const truncateConfirm = useOverlayState();
  const splitConfirm = useOverlayState();

  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [listingType, setListingType] = useState<ListingType | "all">("all");
  const [propertyType, setPropertyType] = useState<PropertyType | "all">("all");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | "all">("all");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [duplicateGroup, setDuplicateGroup] = useState<"all" | "true" | "false">(
    "all",
  );
  const [pushedToCrm, setPushedToCrm] = useState<"all" | "true" | "false">("all");
  const [pendingCrmUpdate, setPendingCrmUpdate] = useState<"all" | "true" | "false">(
    "all",
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [deletePropertyId, setDeletePropertyId] = useState<string | null>(null);

  const query = useMemo<AdminUserPropertyListQuery>(
    () => ({
      page,
      limit,
      ...(status !== "all" && { status }),
      ...(listingType !== "all" && { listing_type: listingType }),
      ...(propertyType !== "all" && { property_type: propertyType }),
      ...(search.trim() && { search: search.trim() }),
      ...(userId !== "all" && { user_id: userId }),
      ...(agencyId !== "all" && { agency_id: agencyId }),
      ...(duplicateGroup !== "all" && {
        has_duplicate_group: duplicateGroup === "true",
      }),
      ...(pushedToCrm !== "all" && {
        pushed_to_crm: pushedToCrm === "true",
      }),
      ...(pendingCrmUpdate !== "all" && {
        pending_crm_update: pendingCrmUpdate === "true",
      }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [
      page,
      limit,
      status,
      listingType,
      propertyType,
      search,
      userId,
      agencyId,
      duplicateGroup,
      pushedToCrm,
      pendingCrmUpdate,
      dateFrom,
      dateTo,
    ],
  );

  const countQuery = useMemo<AdminUserPropertyCountQuery>(() => {
    const { page: _page, limit: _limit, ...filters } = query;
    return filters;
  }, [query]);

  const { data, isPending } = useAdminUserProperties(query);
  const { data: countData } = useAdminUserPropertiesCount(countQuery);
  const { data: usersData } = useAdminUsers({ limit: 100 });
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const deleteUserProperty = useDeleteAdminUserProperty();
  const deleteUserProperties = useDeleteAdminUserProperties();
  const dedupeUserPropertyGroups = useDedupeAdminUserPropertyGroups();
  const splitUserProperties = useSplitAdminUserProperties();
  const truncateDescriptions = useTruncateAdminUserPropertyDescriptions();

  const properties = data?.data ?? [];
  const pagination = data?.pagination;
  const total = countData?.total;
  const users = usersData?.data ?? [];
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
        id: "delete",
        label: "Delete selected",
        variant: "danger",
        icon: Trash2,
        isDisabled: selectedCount < 1,
      },
    ];

    if (duplicateGroup === "true") {
      actions.splice(1, 0, {
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
    if (actionId === "dedupe") {
      dedupeConfirm.open();
      return;
    }
    if (actionId === "delete") {
      bulkDeleteConfirm.open();
    }
  };

  const handleDelete = async () => {
    if (!deletePropertyId) return;
    await deleteUserProperty.mutateAsync(deletePropertyId);
    setSelectedKeys((prev) => {
      if (prev === "all") {
        return new Set(
          properties
            .map((property) => property.id)
            .filter((id) => id !== deletePropertyId),
        );
      }
      const next = new Set(prev);
      next.delete(deletePropertyId);
      return next;
    });
    setDeletePropertyId(null);
  };

  const handleBulkDelete = async () => {
    await deleteUserProperties.mutateAsync({
      ids: Array.from(selectedIds),
    });
    clearSelection();
  };

  const handleDedupeGroups = async () => {
    await dedupeUserPropertyGroups.mutateAsync({
      ids: Array.from(selectedIds),
    });
    clearSelection();
  };

  const handleSplitFromGroup = async () => {
    await splitUserProperties.mutateAsync({
      ids: Array.from(selectedIds),
    });
    clearSelection();
  };

  const handleTruncateDescriptions = async ({
    text,
    replacement,
  }: {
    text: string;
    replacement?: string;
  }) => {
    await truncateDescriptions.mutateAsync({
      ids: Array.from(selectedIds),
      text,
      ...(replacement ? { replacement } : {}),
    });
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            User properties
          </p>
          <p className="text-sm text-muted">
            Per-user saved copies of normalized listings
            {total != null && (
              <>
                {" "}
                · {total.toLocaleString()}{" "}
                {total === 1 ? "user property" : "user properties"}
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
          placeholder="Search id, title, city, or email…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="w-64"
        />
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
        <Select
          aria-label="Filter by CRM push"
          selectedKey={pushedToCrm}
          onSelectionChange={(key) => {
            setPage(1);
            setPushedToCrm(key as "all" | "true" | "false");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {PropertyCrmPushFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          aria-label="Filter by pending CRM update"
          selectedKey={pendingCrmUpdate}
          onSelectionChange={(key) => {
            setPage(1);
            setPendingCrmUpdate(key as "all" | "true" | "false");
          }}
          className="w-48"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {PropertyPendingCrmUpdateFilterOptions.map((option) => (
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
          No user properties found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="User properties"
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              >
                <Table.Header>
                  <Table.Column className="pr-0">
                    <Checkbox
                      aria-label="Select all user properties on this page"
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
                  <Table.Column isRowHeader>User</Table.Column>
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
                    const groupCellClass = property.duplicate_group_id
                      ? getDuplicateGroupRowClasses(property.duplicate_group_id)
                      : undefined;

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
                          <button
                            type="button"
                            className="text-left text-foreground hover:text-accent transition-colors font-medium"
                            onClick={() =>
                              navigate(
                                Routes.admin.properties.userDetail(property.id),
                              )
                            }
                          >
                            {property.title}
                          </button>
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {property.user?.email ?? "—"}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {property.city ?? "—"}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {formatPrice(property.price, property.currency)}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          <Chip size="sm" variant="soft">
                            <Chip.Label>
                              {property.listing_type.replace(/_/g, " ")}
                            </Chip.Label>
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          <Chip size="sm" variant="soft">
                            <Chip.Label>
                              {property.property_type.replace(/_/g, " ")}
                            </Chip.Label>
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          <PropertyStatusChip status={property.status} />
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {property.duplicate_group_id ? (
                            <PropertyDuplicateGroupChip
                              groupId={property.duplicate_group_id}
                            />
                          ) : (
                            "—"
                          )}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          <TableRowActionsMenu
                            actions={USER_PROPERTY_DELETE_ACTIONS}
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
        state={deleteConfirm}
        title="Delete this user property?"
        description="This cannot be undone. The user's saved copy will be removed."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteUserProperty.isPending}
      />

      <ConfirmationDialog
        state={bulkDeleteConfirm}
        title="Delete selected user properties?"
        description={`This will permanently delete ${selectedCount} user ${selectedCount === 1 ? "property" : "properties"}. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isPending={deleteUserProperties.isPending}
      />

      <ConfirmationDialog
        state={dedupeConfirm}
        title="Keep one property per group?"
        description={`This will delete ${dedupeDeleteCount} duplicate ${dedupeDeleteCount === 1 ? "property" : "properties"} and keep one from each selected group.`}
        confirmLabel="Keep one"
        onConfirm={handleDedupeGroups}
        isPending={dedupeUserPropertyGroups.isPending}
      />

      <ConfirmationDialog
        state={splitConfirm}
        title="Split from duplicate group?"
        description={`This will remove ${selectedGroupedCount} ${selectedGroupedCount === 1 ? "property" : "properties"} from their duplicate groups. Other grouped properties stay linked.`}
        confirmLabel="Split"
        onConfirm={handleSplitFromGroup}
        isPending={splitUserProperties.isPending}
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
