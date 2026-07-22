import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
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
import { Layers, Scissors, Trash2, Ungroup, Upload } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TruncateDescriptionDialog } from "@/components/ui/truncate-description-dialog";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFilterOptions } from "@/config/constants/dropdowns/properties/property-status-filter.options";
import {
  PropertyChangeFilterOptions,
  type PropertyChangeFilter,
} from "@/config/constants/dropdowns/properties/property-change-filter.options";
import { PropertyDuplicateGroupFilterOptions } from "@/config/constants/dropdowns/properties/property-duplicate-group-filter.options";
import { PropertyCrmPushFilterOptions } from "@/config/constants/dropdowns/properties/property-crm-push-filter.options";
import { PropertyPendingCrmUpdateFilterOptions } from "@/config/constants/dropdowns/properties/property-pending-crm-update-filter.options";
import { TablePageSizeOptions } from "@/config/constants/dropdowns/shared/table-page-size.options";
import {
  useDeleteUserProperties,
  useDeleteUserProperty,
  useDedupeUserPropertyGroups,
  usePushUserPropertiesToCrm,
  usePushUserPropertyToCrm,
  useSplitUserProperties,
  useTruncateUserPropertyDescriptions,
  useUserProperties,
  useUserPropertiesCount,
} from "@/features/user-properties/hooks/use-user-properties";
import type {
  UserPropertyCountQuery,
  UserPropertyListQuery,
} from "@/features/user-properties/interfaces/user-properties.interfaces";
import { useTrackableAgencies } from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { getTrackableAgencyLabel } from "@/features/user-tracked-agencies/utils/integration-link.utils";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";
import { formatPrice } from "@/lib/price";
import { toEndOfDayIso, toStartOfDayIso } from "@/lib/date";
import { getDuplicateGroupRowClasses } from "@/lib/duplicate-group-color.utils";
import { getDuplicateGroupDedupePlan } from "@/lib/duplicate-group-dedupe.utils";
import { cn } from "@/lib/utils";

const PROPERTY_PUSH_ACTION: TableRowAction = {
  id: "push-to-crm",
  label: "Push to EstateWeb",
  icon: Upload,
};

const PROPERTY_DELETE_ACTION: TableRowAction = {
  id: "delete",
  label: "Delete",
  variant: "danger",
  icon: Trash2,
};

export default function DashboardPropertiesListPage() {
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();
  const dedupeConfirm = useOverlayState();
  const truncateConfirm = useOverlayState();
  const splitConfirm = useOverlayState();
  const role = useAuthStore((state) => state.role);
  const canDelete = role === RoleTypes.SUPER_ADMIN || role === RoleTypes.ADMIN;

  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [change, setChange] = useState<PropertyChangeFilter | "all">("all");
  const [search, setSearch] = useState("");
  const [trackedAgencyId, setTrackedAgencyId] = useState<string | "all">("all");
  const [duplicateGroup, setDuplicateGroup] = useState<"all" | "true" | "false">("all");
  const [pushedToCrm, setPushedToCrm] = useState<"all" | "true" | "false">("all");
  const [pendingCrmUpdate, setPendingCrmUpdate] = useState<"all" | "true" | "false">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [deletePropertyId, setDeletePropertyId] = useState<string | null>(null);

  const query = useMemo<UserPropertyListQuery>(
    () => ({
      page,
      limit,
      ...(status !== "all" && { status }),
      ...(change !== "all" && { change }),
      ...(search.trim() && { search: search.trim() }),
      ...(trackedAgencyId !== "all" && { user_tracked_agency_id: trackedAgencyId }),
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
      change,
      search,
      trackedAgencyId,
      duplicateGroup,
      pushedToCrm,
      pendingCrmUpdate,
      dateFrom,
      dateTo,
    ],
  );

  const countQuery = useMemo<UserPropertyCountQuery>(() => {
    const { page: _page, limit: _limit, ...filters } = query;
    return filters;
  }, [query]);

  const { data, isPending } = useUserProperties(query);
  const { data: countData } = useUserPropertiesCount(countQuery);
  const { data: agenciesData } = useTrackableAgencies({ limit: 100 });
  const deleteUserProperty = useDeleteUserProperty();
  const deleteUserProperties = useDeleteUserProperties();
  const dedupeUserPropertyGroups = useDedupeUserPropertyGroups();
  const splitUserProperties = useSplitUserProperties();
  const truncateDescriptions = useTruncateUserPropertyDescriptions();
  const pushToCrm = usePushUserPropertyToCrm();
  const pushSelectedToCrm = usePushUserPropertiesToCrm();

  const properties = data?.data ?? [];
  const pagination = data?.pagination;
  const total = countData?.total;
  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") {
      return new Set(properties.map((property) => property.id));
    }
    return new Set([...selectedKeys].map(String));
  }, [selectedKeys, properties]);
  const selectedCount = selectedIds.size;
  const trackedAgencies = (agenciesData?.data ?? []).filter(
    (agency) => agency.is_tracked && agency.user_tracked_agency_id,
  );

  const dedupePlan = useMemo(
    () => getDuplicateGroupDedupePlan(properties, selectedIds),
    [properties, selectedIds],
  );
  const dedupeDeleteCount = dedupePlan.deleteIds.length;
  const canManageBulk = role === RoleTypes.SUPER_ADMIN || role === RoleTypes.ADMIN;
  const selectedGroupedCount = properties.filter(
    (property) => selectedIds.has(property.id) && property.duplicate_group_id,
  ).length;

  const bulkActions = useMemo<TableRowAction[]>(() => {
    const actions: TableRowAction[] = [
      {
        id: "push-to-crm",
        label: "Push to EstateWeb",
        icon: Upload,
        isDisabled: selectedCount < 1 || pushSelectedToCrm.isPending,
      },
      {
        id: "truncate",
        label: "Truncate text",
        icon: Scissors,
        isDisabled: selectedCount < 1,
      },
    ];

    if (canManageBulk) {
      actions.push({
        id: "split",
        label: "Split from group",
        icon: Ungroup,
        isDisabled: selectedGroupedCount < 1,
      });
    }

    if (canManageBulk && duplicateGroup === "true") {
      actions.push({
        id: "dedupe",
        label: "Keep one per group",
        icon: Layers,
        isDisabled: dedupeDeleteCount < 1,
      });
    }

    if (canManageBulk) {
      actions.push({
        id: "delete",
        label: "Delete selected",
        variant: "danger",
        icon: Trash2,
        isDisabled: selectedCount < 1,
      });
    }

    return actions;
  }, [
    canManageBulk,
    dedupeDeleteCount,
    duplicateGroup,
    pushSelectedToCrm.isPending,
    selectedCount,
    selectedGroupedCount,
  ]);

  const clearSelection = () => setSelectedKeys(new Set());

  const handleBulkAction = (actionId: string) => {
    if (actionId === "push-to-crm") {
      void handleBulkPushToCrm();
      return;
    }
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
    await deleteUserProperties.mutateAsync({ ids: Array.from(selectedIds) });
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

  const handleBulkPushToCrm = async () => {
    await pushSelectedToCrm.mutateAsync({ ids: Array.from(selectedIds) });
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">My Properties</p>
          <p className="text-sm text-muted">
            Your tracked listings
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
        <Input
          placeholder="Search property id, internal id, CRM id, title, or city…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="w-80"
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
          aria-label="Filter by change"
          selectedKey={change}
          onSelectionChange={(key) => {
            setPage(1);
            setChange(key as PropertyChangeFilter | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {PropertyChangeFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          aria-label="Filter by tracked agency"
          selectedKey={trackedAgencyId}
          onSelectionChange={(key) => {
            setPage(1);
            setTrackedAgencyId(key as string | "all");
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
                All tracked agencies
              </ListBox.Item>
              {trackedAgencies.map((agency) => (
                <ListBox.Item
                  key={agency.user_tracked_agency_id!}
                  id={agency.user_tracked_agency_id!}
                >
                  {getTrackableAgencyLabel(agency)}
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
        <TableSkeleton rows={8} columns={6} />
      ) : properties.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No properties yet. Track an agency to start receiving listings.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="My properties"
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
                  <Table.Column isRowHeader>City</Table.Column>
                  <Table.Column isRowHeader>Price</Table.Column>
                  <Table.Column isRowHeader>Status</Table.Column>
                  <Table.Column isRowHeader>CRM</Table.Column>
                  <Table.Column isRowHeader>Integration ID</Table.Column>
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
                    const rowActions: TableRowAction[] = [
                      {
                        ...PROPERTY_PUSH_ACTION,
                        isDisabled:
                          pushToCrm.isPending && pushToCrm.variables === property.id,
                      },
                      ...(canDelete ? [PROPERTY_DELETE_ACTION] : []),
                    ];

                    return (
                    <Table.Row
                      key={property.id}
                      id={property.id}
                      onAction={() => navigate(Routes.dashboard.properties.detail(property.id))}
                      className="cursor-pointer"
                    >
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
                        <span
                          className={cn(
                            "font-medium text-foreground",
                            isRemoved && "line-through",
                          )}
                        >
                          {property.title}
                        </span>
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>{property.city ?? "—"}</Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        {formatPrice(property.price, property.currency)}
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        <PropertyStatusChip status={property.status} />
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        {property.pending_crm_update ? (
                          <div
                            className="flex items-center gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Chip size="sm" variant="soft" color="warning">
                              Pending
                            </Chip>
                            <Button
                              size="sm"
                              variant="secondary"
                              isPending={
                                pushToCrm.isPending && pushToCrm.variables === property.id
                              }
                              onPress={() => pushToCrm.mutate(property.id)}
                            >
                              Update CRM
                            </Button>
                          </div>
                        ) : property.integration_property_id ? (
                          <Chip size="sm" variant="soft" color="success">
                            Synced
                          </Chip>
                        ) : (
                          "—"
                        )}
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        {property.integration_property_id ?? "—"}
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        <TableRowActionsMenu
                          actions={rowActions}
                          onAction={(actionId) => {
                            if (actionId === "push-to-crm") {
                              pushToCrm.mutate(property.id);
                              return;
                            }
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

      {canDelete ? (
        <>
          <ConfirmationDialog
            state={deleteConfirm}
            title="Delete this property?"
            description="This cannot be undone."
            confirmLabel="Delete"
            onConfirm={handleDelete}
            isPending={deleteUserProperty.isPending}
          />
          <ConfirmationDialog
            state={bulkDeleteConfirm}
            title="Delete selected properties?"
            description={`This will permanently delete ${selectedCount} properties. This cannot be undone.`}
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
        </>
      ) : null}

      <TruncateDescriptionDialog
        state={truncateConfirm}
        propertyCount={selectedCount}
        onConfirm={handleTruncateDescriptions}
        isPending={truncateDescriptions.isPending}
      />
    </div>
  );
}
