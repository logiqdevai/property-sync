import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chip, Input, Pagination, Select, ListBox, Table } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { PropertyStatusChip } from "./components/property-status-chip";
import type { PropertyStatus } from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFilterOptions } from "@/config/constants/dropdowns/property-status-filter.options";
import { useUserProperties } from "@/features/user-properties/hooks/use-user-properties";
import type { UserPropertyListQuery } from "@/features/user-properties/interfaces/user-properties.interfaces";
import { useTrackableAgencies } from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { getTrackableAgencyLabel } from "@/features/user-tracked-agencies/utils/integration-link.utils";

export default function DashboardPropertiesListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [city, setCity] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [trackedAgencyId, setTrackedAgencyId] = useState<string | "all">("all");
  const [page, setPage] = useState(1);

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
  const properties = data?.data ?? [];
  const pagination = data?.pagination;
  const trackedAgencies = (agenciesData?.data ?? []).filter(
    (agency) => agency.is_tracked && agency.user_tracked_agency_id,
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">My Properties</p>
          <p className="text-sm text-muted">Your saved copies of tracked listings.</p>
        </div>
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">My Properties</p>
        <p className="text-sm text-muted">Your saved copies of tracked listings.</p>
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
                  <Table.Column isRowHeader>Title</Table.Column>
                  <Table.Column isRowHeader>City</Table.Column>
                  <Table.Column isRowHeader>Price</Table.Column>
                  <Table.Column isRowHeader>Status</Table.Column>
                  <Table.Column isRowHeader>Edited</Table.Column>
                </Table.Header>
                <Table.Body>
                  {properties.map((property) => (
                    <Table.Row
                      key={property.id}
                      id={property.id}
                      onAction={() => navigate(Routes.dashboard.properties.detail(property.id))}
                      className="cursor-pointer"
                    >
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
