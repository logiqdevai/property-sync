import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Pagination, Select, ListBox, Table, useOverlayState } from "@heroui/react";
import { Trash2 } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import { PropertyDuplicateGroupChip } from "@/components/ui/property-duplicate-group-chip";
import { RoleGate } from "@/components/providers/role-gate";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import type { PropertyStatus } from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFilterOptions } from "@/config/constants/dropdowns/property-status-filter.options";
import { PropertyDuplicateGroupFilterOptions } from "@/config/constants/dropdowns/property-duplicate-group-filter.options";
import {
  useDeleteUserProperties,
  useDeleteUserProperty,
  useDedupeUserPropertyGroups,
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
import { getDuplicateGroupRowClasses } from "@/lib/duplicate-group-color.utils";
import { getDuplicateGroupDedupePlan } from "@/lib/duplicate-group-dedupe.utils";

const PROPERTY_DELETE_ACTIONS: TableRowAction[] = [
  { id: "delete", label: "Delete", variant: "danger", icon: Trash2 },
];

export default function DashboardPropertiesListPage() {
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();
  const dedupeConfirm = useOverlayState();
  const role = useAuthStore((state) => state.role);
  const canDelete = role === RoleTypes.SUPER_ADMIN || role === RoleTypes.ADMIN;

  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [trackedAgencyId, setTrackedAgencyId] = useState<string | "all">("all");
  const [duplicateGroup, setDuplicateGroup] = useState<"all" | "true" | "false">("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletePropertyId, setDeletePropertyId] = useState<string | null>(null);

  const query = useMemo<UserPropertyListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(trackedAgencyId !== "all" && { user_tracked_agency_id: trackedAgencyId }),
      ...(duplicateGroup !== "all" && {
        has_duplicate_group: duplicateGroup === "true",
      }),
    }),
    [page, status, trackedAgencyId, duplicateGroup],
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

  const properties = data?.data ?? [];
  const pagination = data?.pagination;
  const total = countData?.total;
  const selectedCount = selectedIds.size;
  const trackedAgencies = (agenciesData?.data ?? []).filter(
    (agency) => agency.is_tracked && agency.user_tracked_agency_id,
  );

  const dedupePlan = useMemo(
    () => getDuplicateGroupDedupePlan(properties, selectedIds),
    [properties, selectedIds],
  );
  const dedupeDeleteCount = dedupePlan.deleteIds.length;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deletePropertyId) return;
    await deleteUserProperty.mutateAsync(deletePropertyId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(deletePropertyId);
      return next;
    });
    setDeletePropertyId(null);
  };

  const handleBulkDelete = async () => {
    await deleteUserProperties.mutateAsync({ ids: Array.from(selectedIds) });
    setSelectedIds(new Set());
  };

  const handleDedupeGroups = async () => {
    await dedupeUserPropertyGroups.mutateAsync({
      ids: Array.from(selectedIds),
    });
    setSelectedIds(new Set());
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">My Properties</p>
          <p className="text-sm text-muted">Your tracked listings.</p>
        </div>
        <TableSkeleton rows={8} columns={6} />
      </div>
    );
  }

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
        <RoleGate roles={[RoleTypes.ADMIN]}>
          <div className="flex items-center gap-2">
            {duplicateGroup === "true" ? (
              <Button
                variant="secondary"
                isDisabled={dedupeDeleteCount < 1}
                onPress={dedupeConfirm.open}
              >
                Keep one per group ({dedupeDeleteCount})
              </Button>
            ) : null}
            <Button
              variant="danger"
              isDisabled={selectedCount < 1}
              onPress={bulkDeleteConfirm.open}
            >
              Delete selected ({selectedCount})
            </Button>
          </div>
        </RoleGate>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
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
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No properties yet. Track an agency to start receiving listings.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="My properties">
                <Table.Header>
                  {canDelete ? <Table.Column isRowHeader>Select</Table.Column> : null}
                  <Table.Column isRowHeader>Title</Table.Column>
                  <Table.Column isRowHeader>City</Table.Column>
                  <Table.Column isRowHeader>Price</Table.Column>
                  <Table.Column isRowHeader>Status</Table.Column>
                  <Table.Column isRowHeader>Group</Table.Column>
                  {canDelete ? <Table.Column isRowHeader>Actions</Table.Column> : null}
                </Table.Header>
                <Table.Body>
                  {properties.map((property) => {
                    const groupCellClass = property.duplicate_group_id
                      ? getDuplicateGroupRowClasses(property.duplicate_group_id)
                      : undefined;

                    return (
                    <Table.Row
                      key={property.id}
                      id={property.id}
                      onAction={() => navigate(Routes.dashboard.properties.detail(property.id))}
                      className="cursor-pointer"
                    >
                      {canDelete ? (
                        <Table.Cell className={groupCellClass}>
                          <div onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(property.id)}
                              onChange={() => toggleSelection(property.id)}
                              aria-label={`Select ${property.title}`}
                            />
                          </div>
                        </Table.Cell>
                      ) : null}
                      <Table.Cell className={groupCellClass}>
                        <span className="font-medium text-foreground">{property.title}</span>
                      </Table.Cell>
                      <Table.Cell className={groupCellClass}>{property.city ?? "—"}</Table.Cell>
                      <Table.Cell className={groupCellClass}>
                        {formatPrice(property.price, property.currency)}
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
                      {canDelete ? (
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
                      ) : null}
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
        </>
      ) : null}
    </div>
  );
}
