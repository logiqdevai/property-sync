import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Input, Pagination, Select, ListBox, Table, useOverlayState } from "@heroui/react";
import { Layers } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PropertyStatusChip } from "./components/property-status-chip";
import { useMergeProperties, useProperties } from "@/features/properties/hooks/use-properties";
import {
  ListingTypes,
  PropertyStatuses,
  PropertyTypes,
  type ListingType,
  type PropertyListQuery,
  type PropertyStatus,
  type PropertyType,
} from "@/features/properties/interfaces/properties.interfaces";

const statusOptions: { id: PropertyStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  ...Object.values(PropertyStatuses).map((status) => ({
    id: status,
    label: status.replace(/_/g, " "),
  })),
];

const listingTypeOptions: { id: ListingType | "all"; label: string }[] = [
  { id: "all", label: "All listing types" },
  ...Object.values(ListingTypes).map((type) => ({
    id: type,
    label: type.replace(/_/g, " "),
  })),
];

const propertyTypeOptions: { id: PropertyType | "all"; label: string }[] = [
  { id: "all", label: "All property types" },
  ...Object.values(PropertyTypes).map((type) => ({
    id: type,
    label: type.replace(/_/g, " "),
  })),
];

export default function PropertiesListPage() {
  const navigate = useNavigate();
  const mergeConfirm = useOverlayState();

  const [status, setStatus] = useState<PropertyStatus | "all">("all");
  const [listingType, setListingType] = useState<ListingType | "all">("all");
  const [propertyType, setPropertyType] = useState<PropertyType | "all">("all");
  const [city, setCity] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const query = useMemo<PropertyListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(listingType !== "all" && { listing_type: listingType }),
      ...(propertyType !== "all" && { property_type: propertyType }),
      ...(city.trim() && { city: city.trim() }),
      ...(priceMin && { price_min: Number(priceMin) }),
      ...(priceMax && { price_max: Number(priceMax) }),
      ...(search.trim() && { search: search.trim() }),
    }),
    [page, status, listingType, propertyType, city, priceMin, priceMax, search],
  );

  const { data, isPending } = useProperties(query);
  const mergeProperties = useMergeProperties();

  const properties = data?.data ?? [];
  const pagination = data?.pagination;
  const selectedCount = selectedIds.size;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    await mergeProperties.mutateAsync({ property_ids: Array.from(selectedIds) });
    setSelectedIds(new Set());
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Properties</p>
          <p className="text-sm text-muted">Normalized listings from crawl runs.</p>
        </div>
        <TableSkeleton rows={10} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Properties</p>
          <p className="text-sm text-muted">Normalized listings from crawl runs.</p>
        </div>
        <Button
          variant="secondary"
          isDisabled={selectedCount < 2}
          onPress={mergeConfirm.open}
        >
          Merge selected ({selectedCount})
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search title or city…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="w-56"
        />
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
              {statusOptions.map((option) => (
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
              {listingTypeOptions.map((option) => (
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
              {propertyTypeOptions.map((option) => (
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
          No properties found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Properties">
                <Table.Header>
                  <Table.Column isRowHeader>Select</Table.Column>
                  <Table.Column isRowHeader>Title</Table.Column>
                  <Table.Column isRowHeader>City</Table.Column>
                  <Table.Column isRowHeader>Price</Table.Column>
                  <Table.Column isRowHeader>Listing</Table.Column>
                  <Table.Column isRowHeader>Type</Table.Column>
                  <Table.Column isRowHeader>Status</Table.Column>
                  <Table.Column isRowHeader>Group</Table.Column>
                </Table.Header>
                <Table.Body>
                  {properties.map((property) => (
                    <Table.Row key={property.id}>
                      <Table.Cell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(property.id)}
                          onChange={() => toggleSelection(property.id)}
                          aria-label={`Select ${property.title}`}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <button
                          type="button"
                          className="text-left text-foreground hover:text-accent transition-colors font-medium"
                          onClick={() => navigate(Routes.admin.properties.detail(property.id))}
                        >
                          {property.title}
                        </button>
                      </Table.Cell>
                      <Table.Cell>{property.city ?? "—"}</Table.Cell>
                      <Table.Cell>
                        {property.price
                          ? `${property.price} ${property.currency ?? "EUR"}`
                          : "—"}
                      </Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" variant="soft">
                          <Chip.Label>{property.listing_type.replace(/_/g, " ")}</Chip.Label>
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" variant="soft">
                          <Chip.Label>{property.property_type.replace(/_/g, " ")}</Chip.Label>
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <PropertyStatusChip status={property.status} />
                      </Table.Cell>
                      <Table.Cell>
                        {property.duplicate_group_id ? (
                          <Chip size="sm" variant="soft" color="warning">
                            <Chip.Label>
                              <span className="inline-flex items-center gap-1">
                                <Layers className="size-3" />
                                Grouped
                              </span>
                            </Chip.Label>
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

      <ConfirmationDialog
        state={mergeConfirm}
        title="Merge selected properties?"
        description={`This will assign a shared duplicate group to ${selectedCount} properties.`}
        confirmLabel="Merge"
        onConfirm={handleMerge}
        isPending={mergeProperties.isPending}
      />
    </div>
  );
}
