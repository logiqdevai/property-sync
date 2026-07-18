import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Chip } from "@heroui/react";
import {
  Bath,
  BedDouble,
  Building2,
  Calendar,
  ExternalLink,
  Layers,
  MapPin,
  Maximize2,
  Ruler,
} from "lucide-react";
import { ListingTypeFilterOptions } from "@/config/constants/dropdowns/listing-type-filter.options";
import { PropertyTypeFilterOptions } from "@/config/constants/dropdowns/property-type-filter.options";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import { formatPropertyHistoryLabel } from "@/features/properties/utils/format-property-history";
import type {
  CmsPropertyFieldEntry,
  CmsPropertyMetadata,
  PropertyCmsFields,
} from "@/features/properties/interfaces/cms-property.interface";
import type {
  ListingType,
  PropertyHistoryEntry,
  PropertySourceLink,
  PropertyStatus,
  PropertyType,
} from "@/features/properties/interfaces/properties.interfaces";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { formatDateTime } from "@/lib/date";
import { formatPrice } from "@/lib/price";

export interface PropertyDetailViewData extends Partial<PropertyCmsFields> {
  title: string;
  property_id?: string;
  internal_id?: string | null;
  integration_property_id?: string | null;
  description: string | null;
  listing_type: ListingType;
  property_type: PropertyType;
  status: PropertyStatus;
  price: string | null;
  currency: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  postal_code?: string | null;
  country?: string | null;
  square_meters: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  construction_year: number | null;
  renovation_year?: number | null;
  features: string[] | null;
  images: string[] | null;
  duplicate_group_id?: string | null;
  source_links?: PropertySourceLink[];
  history: PropertyHistoryEntry[];
}

function formatCmsMetadata(metadata: CmsPropertyMetadata | null | undefined): string[] {
  if (!metadata) return [];
  return Object.entries(metadata)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function formatLocation(property: PropertyDetailViewData): string | null {
  const parts = [
    property.address,
    property.district,
    property.city,
    property.postal_code,
    property.country,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(", ") : null;
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <span className="font-mono text-sm text-foreground truncate">{value}</span>
    </div>
  );
}

function SpecItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-secondary/60 px-3 py-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-tertiary-bg text-tertiary">
        <Icon className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
        <span className="text-sm font-medium text-foreground tabular-nums">{value}</span>
      </div>
    </div>
  );
}

interface PropertyDetailViewProps {
  property: PropertyDetailViewData;
  backHref: string;
  backLabel: string;
  headerExtra?: ReactNode;
  headerActions?: ReactNode;
  banner?: ReactNode;
  details?: ReactNode;
  showFieldDiff?: boolean;
  footer?: ReactNode;
}

export function PropertyDetailView({
  property,
  backHref,
  backLabel,
  headerExtra,
  headerActions,
  banner,
  details,
  showFieldDiff = false,
  footer,
}: PropertyDetailViewProps) {
  const sourceLinks = property.source_links ?? [];
  const cmsFieldEntries = (property.cms_fields ?? []) as CmsPropertyFieldEntry[];
  const cmsMetadataLines = formatCmsMetadata(property.cms_metadata ?? null);
  const location = formatLocation(property);
  const heroImage = property.images?.[0] ?? null;
  const primaryLink =
    sourceLinks.find((link) => link.is_primary_source) ?? sourceLinks[0] ?? null;
  const hasPrice = property.price != null && property.price !== "";

  const specs = [
    property.bedrooms != null
      ? { icon: BedDouble, label: "Bedrooms", value: String(property.bedrooms) }
      : null,
    property.bathrooms != null
      ? { icon: Bath, label: "Bathrooms", value: String(property.bathrooms) }
      : null,
    property.square_meters
      ? {
          icon: Maximize2,
          label: "Size",
          value: `${property.square_meters} m²`,
        }
      : null,
    property.floor
      ? { icon: Building2, label: "Floor", value: property.floor }
      : null,
    property.construction_year != null
      ? {
          icon: Calendar,
          label: "Built",
          value: String(property.construction_year),
        }
      : null,
    property.renovation_year != null
      ? {
          icon: Ruler,
          label: "Renovated",
          value: String(property.renovation_year),
        }
      : null,
  ].filter(Boolean) as {
    icon: typeof BedDouble;
    label: string;
    value: string;
  }[];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Link
          to={backHref}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          {backLabel}
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {details ? headerExtra : null}
          {headerActions}
        </div>
      </div>

      {banner}

      {details ?? (
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)] lg:min-h-[22rem]">
            <div className="relative min-h-56 bg-surface-secondary lg:min-h-full">
              {heroImage ? (
                <a
                  href={heroImage}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute inset-0 block"
                >
                  <img
                    src={heroImage}
                    alt={property.title}
                    className="size-full object-cover"
                  />
                </a>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted">
                  <Building2 className="size-10 opacity-40" />
                </div>
              )}
              {property.images && property.images.length > 1 && (
                <span className="absolute bottom-3 left-3 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
                  {property.images.length} photos
                </span>
              )}
            </div>

            <div className="flex flex-col gap-5 p-5 sm:p-6">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PropertyStatusChip status={property.status} />
                  <Chip size="sm" variant="soft">
                    <Chip.Label>
                      {getDropdownOptionLabel(
                        ListingTypeFilterOptions,
                        property.listing_type,
                      )}
                    </Chip.Label>
                  </Chip>
                  <Chip size="sm" variant="soft">
                    <Chip.Label>
                      {getDropdownOptionLabel(
                        PropertyTypeFilterOptions,
                        property.property_type,
                      )}
                    </Chip.Label>
                  </Chip>
                  {property.duplicate_group_id && (
                    <Chip size="sm" variant="soft" color="warning">
                      <Chip.Label>
                        <span className="inline-flex items-center gap-1">
                          <Layers className="size-3" />
                          Duplicate group
                        </span>
                      </Chip.Label>
                    </Chip>
                  )}
                  {headerExtra}
                </div>

                <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
                  {property.title}
                </h1>

                <p className="text-3xl font-semibold tracking-tight text-tertiary tabular-nums">
                  {hasPrice
                    ? formatPrice(property.price, property.currency)
                    : "Price not set"}
                </p>

                {location && (
                  <p className="flex items-start gap-2 text-sm text-muted">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-tertiary" />
                    <span>{location}</span>
                  </p>
                )}
              </div>

              {specs.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {specs.map((spec) => (
                    <SpecItem
                      key={spec.label}
                      icon={spec.icon}
                      label={spec.label}
                      value={spec.value}
                    />
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
                <MetaItem label="Property ID" value={property.property_id ?? "—"} />
                <MetaItem label="Internal ID" value={property.internal_id ?? "—"} />
                <MetaItem
                  label="CMS ID"
                  value={property.integration_property_id ?? "—"}
                />
              </div>

              {primaryLink && (
                <a
                  href={primaryLink.source_property.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary/40 px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-accent-bg"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                      {primaryLink.is_primary_source ? "Primary listing" : "Source listing"}
                    </span>
                    <span className="truncate text-sm text-foreground group-hover:text-accent">
                      {primaryLink.source_property.raw_title ??
                        primaryLink.source_property.source_url}
                    </span>
                  </div>
                  <ExternalLink className="size-4 shrink-0 text-accent" />
                </a>
              )}

              {(property.price_start || property.price_web) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  {property.price_start && (
                    <span>
                      List{" "}
                      <span className="text-foreground tabular-nums">
                        {formatPrice(property.price_start, property.currency)}
                      </span>
                    </span>
                  )}
                  {property.price_web && (
                    <span>
                      Web{" "}
                      <span className="text-foreground tabular-nums">
                        {formatPrice(property.price_web, property.currency)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {property.description && (
            <div className="border-t border-border px-5 py-5 sm:px-6">
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                Description
              </h2>
              <p className="max-w-3xl text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {property.description}
              </p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">CMS & location</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <p>
            <span className="text-muted">Property type:</span>{" "}
            {property.estateweb_type_name ?? "—"}
          </p>
          {property.estateweb_location_name && (
            <p>
              <span className="text-muted">EstateWeb location:</span>{" "}
              {property.estateweb_location_name}
            </p>
          )}
          <p>
            <span className="text-muted">Video URL:</span>{" "}
            {property.video_url ? (
              <a
                href={property.video_url}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline break-all"
              >
                {property.video_url}
              </a>
            ) : (
              "—"
            )}
          </p>
          <p>
            <span className="text-muted">Airport distance:</span> {property.distance_airport ?? "—"}
          </p>
          <p>
            <span className="text-muted">Port distance:</span> {property.distance_port ?? "—"}
          </p>
          <p>
            <span className="text-muted">Beach distance:</span> {property.distance_beach ?? "—"}
          </p>
        </div>
        {cmsFieldEntries.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">CMS fields</h3>
            <div className="flex flex-wrap gap-2">
              {cmsFieldEntries.map((field) => (
                <Chip key={`${field.name}-${field.value}`} size="sm" variant="soft">
                  <Chip.Label>
                    {field.name}: {field.value}
                  </Chip.Label>
                </Chip>
              ))}
            </div>
          </div>
        )}
        {cmsMetadataLines.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">CMS metadata</h3>
            <ul className="text-sm text-muted flex flex-col gap-1">
              {cmsMetadataLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Images</h2>
        {!property.images || property.images.length === 0 ? (
          <p className="text-sm text-muted">No images yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {property.images.map((src, index) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg border border-border"
              >
                <img
                  src={src}
                  alt={`${property.title} photo ${index + 1}`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Features</h2>
        {!property.features || property.features.length === 0 ? (
          <p className="text-sm text-muted">No features listed.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {property.features.map((feature) => (
              <Chip key={feature} size="sm" variant="soft">
                <Chip.Label>{feature}</Chip.Label>
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        {property.history.length === 0 ? (
          <p className="text-sm text-muted">No history yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {property.history.map((entry) =>
              showFieldDiff ? (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 text-sm border border-border rounded-lg p-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">
                      {formatPropertyHistoryLabel(entry)}
                    </span>
                    {entry.field && (
                      <span className="text-xs text-muted">
                        {entry.field}: {String(entry.old_value ?? "—")} →{" "}
                        {String(entry.new_value ?? "—")}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {formatDateTime(entry.created_at)}
                  </span>
                </li>
              ) : (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 text-sm border-l-2 border-accent/30 pl-4 py-1"
                >
                  <span className="text-foreground">{formatPropertyHistoryLabel(entry)}</span>
                  <span className="text-muted shrink-0">{formatDateTime(entry.created_at)}</span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {footer}
    </div>
  );
}
