import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Input, Pagination, Select, ListBox, Table, useOverlayState } from "@heroui/react";
import { Trash2 } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import { RoleGate } from "@/components/providers/role-gate";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import type { PropertyStatus } from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFilterOptions } from "@/config/constants/dropdowns/property-status-filter.options";
import {
  useDeleteUserProperties,
  useDeleteUserProperty,
  useUserProperties,
} from "@/features/user-properties/hooks/use-user-properties";
import type { UserPropertyListQuery } from "@/features/user-properties/interfaces/user-properties.interfaces";
import { useTrackableAgencies } from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { getTrackableAgencyLabel } from "@/features/user-tracked-agencies/utils/integration-link.utils";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";

const PROPERTY_DELETE_ACTIONS: TableRowAction[] = [
  { id: "delete", label: "Delete", variant: "danger", icon: Trash2 },
];

export default function DashboardPropertiesListPage() {
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();
  const role = useAuthStore((state) => state.role);
  const canDelete = role === RoleTypes.SUPER_ADMIN || role === RoleTypes.ADMIN;

  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [city, setCity] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [trackedAgencyId, setTrackedAgencyId] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletePropertyId, setDeletePropertyId] = useState<string | null>(null);

  const query = useMemo<UserPropertyListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(city.trim() && { city: city.trim() }),
      ...(priceMin && { price_min: Number(priceMin) }),
      ...(priceMax && { price_max: Number(priceMax) }),
      ...(trackedAgencyId !== "all" && { user_tracked_agency_id: trackedAgencyId }),
    }),
    [page, status, city, priceMin, priceMax, trackedAgencyId],
  );

  const { data, isPending } = useUserProperties(query);
  const { data: agenciesData } = useTrackableAgencies({ limit: 100 });
  const deleteUserProperty = useDeleteUserProperty();
  const deleteUserProperties = useDeleteUserProperties();

  const properties = data?.data ?? [];
  const pagination = data?.pagination;
  const selectedCount = selectedIds.size;
  const trackedAgencies = (agenciesData?.data ?? []).filter(
    (agency) => agency.is_tracked && agency.user_tracked_agency_id,
  );

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

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">My Properties</p>
          <p className="text-sm text-muted">Your tracked listings.</p>
        </div>
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">My Properties</p>
          <p className="text-sm text-muted">Your tracked listings.</p>
        </div>
        <RoleGate roles={[RoleTypes.ADMIN]}>
          <Button
            variant="danger"
            isDisabled={selectedCount < 1}
            onPress={bulkDeleteConfirm.open}
          >
            Delete selected ({selectedCount})
          </Button>
        </RoleGate>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="City"
          value={city}
          onChange={(e) => {
            setPage(1);
            setCity(e.target.value);
          }}
          className="w-40"
        />
        <Input
          placeholder="Min price"
          type="number"
          value={priceMin}
          onChange={(e) => {
            setPage(1);
            setPriceMin(e.target.value);
          }}
          className="w-32"
        />
        <Input
          placeholder="Max price"
          type="number"
          value={priceMax}
          onChange={(e) => {
            setPage(1);
            setPriceMax(e.target.value);
          }}
          className="w-32"
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
                  <Table.Column isRowHeader>Edited</Table.Column>
                  {canDelete ? <Table.Column isRowHeader>Actions</Table.Column> : null}
                </Table.Header>
                <Table.Body>
                  {properties.map((property) => (
                    <Table.Row
                      key={property.id}
                      id={property.id}
                      onAction={() => navigate(Routes.dashboard.properties.detail(property.id))}
                      className="cursor-pointer"
                    >
                      {canDelete ? (
                        <Table.Cell>
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
                      <Table.Cell>
                        <span className="font-medium text-foreground">{property.title}</span>
                      </Table.Cell>
                      <Table.Cell>{property.city ?? "—"}</Table.Cell>
                      <Table.Cell>
                        {property.price
                          ? `${property.price} ${property.currency ?? "EUR"}`
                          : "—"}
                      </Table.Cell>
                      <Table.Cell>
                        <PropertyStatusChip status={property.status} />
                      </Table.Cell>
                      <Table.Cell>
                        {property.is_modified ? (
                          <Chip size="sm" variant="soft" color="warning">
                            <Chip.Label>Edited</Chip.Label>
                          </Chip>
                        ) : (
                          "—"
                        )}
                      </Table.Cell>
                      {canDelete ? (
                        <Table.Cell>
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
        </>
      ) : null}
    </div>
  );
}
