import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Chip,
  ListBox,
  Select,
  useOverlayState,
} from "@heroui/react";
import {
  Bath,
  BedDouble,
  Building2,
  Calendar,
  Columns2,
  ExternalLink,
  Mail,
  MapPin,
  Maximize2,
  Ruler,
} from "lucide-react";
import { getCrmPropertyAppUrl } from "@/config/constants/crm-app-urls";
import { ListingTypeFilterOptions } from "@/config/constants/dropdowns/properties/listing-type-filter.options";
import { PropertyTypeFilterOptions } from "@/config/constants/dropdowns/properties/property-type-filter.options";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import { PropertyDuplicateGroupChip } from "@/components/ui/property-duplicate-group-chip";
import type { EstateWebImageOptions } from "@/components/ui/estateweb-image-options-modal";
import {
  PropertyImagesGrid,
  PropertyPhoto,
  type PropertyImagesGridProps,
} from "@/components/ui/property-images-grid";
import { PropertyImagesCompareDialog } from "@/components/ui/property-images-compare-dialog";
import type { MigrateIntegrationImagesMode } from "@/features/user-properties/interfaces/user-properties.interfaces";
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
import type { IntegrationProperty } from "@/features/integration-property/interfaces/integration-property.interfaces";
import type {
  PendingImageOp,
  PropertyLocalizedContent,
} from "@/features/user-properties/interfaces/user-properties.interfaces";
import { getContentLanguageLabel } from "@/config/constants/dropdowns/agencies/content-language-form.options";
import {
  normalizeSourceImageIdentity,
  resolvePropertyDisplayImages,
  type PropertyDisplayImage,
} from "@/features/integration-property/utils/resolve-property-display-images";
import { PropertyHistoryChangeLabel } from "@/components/ui/property-history-change-label";
import { PropertyLocationMap } from "@/components/map/property-location-map";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { formatDateTime } from "@/lib/date";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

const ESTATEWEB_LANG_BY_ID: Record<number, string> = {
  1: "EL",
  2: "EN",
  3: "DE",
  4: "FR",
  5: "IT",
  6: "RU",
};

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
  latitude?: string | null;
  longitude?: string | null;
  square_meters: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  construction_year: number | null;
  renovation_year?: number | null;
  features: string[] | null;
  images: string[] | null;
  image_limit?: number | null;
  tracked_image_count?: number;
  canonical_images?: string[];
  integration_property?: IntegrationProperty | null;
  localized_contents?: PropertyLocalizedContent[];
  duplicate_group_id?: string | null;
  source_links?: PropertySourceLink[];
  history: PropertyHistoryEntry[];
  integration_email?: string | null;
  created_at?: string;
  updated_at?: string;
}

function formatCmsMetadata(metadata: CmsPropertyMetadata | null | undefined): string[] {
  if (!metadata) return [];
  return Object.entries(metadata)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function buildLocalizedContentRows(property: PropertyDetailViewData): Array<{
  key: string;
  language: string;
  label: string;
  title: string | null;
  description: string | null;
  source: "crm" | "generated";
}> {
  const ads = property.integration_property?.ads ?? null;
  if (Array.isArray(ads) && ads.length > 0) {
    return ads
      .map((ad) => {
        const title = ad.title?.trim() || null;
        const description =
          ad.description?.trim() || ad.text?.trim() || null;
        if (!title && !description) return null;
        const language = ESTATEWEB_LANG_BY_ID[ad.lang_id] ?? String(ad.lang_id);
        return {
          key: `ad-${ad.lang_id}`,
          language,
          label: getContentLanguageLabel(language),
          title,
          description,
          source: "crm" as const,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  const contents = property.localized_contents ?? [];
  if (contents.length === 0) return [];

  const byLanguage = new Map<
    string,
    { title: string | null; description: string | null }
  >();
  for (const row of contents) {
    const current = byLanguage.get(row.language) ?? {
      title: null,
      description: null,
    };
    if (row.content_type === "TITLE") current.title = row.text;
    if (row.content_type === "DESCRIPTION") current.description = row.text;
    byLanguage.set(row.language, current);
  }

  return [...byLanguage.entries()].map(([language, values]) => ({
    key: `loc-${language}`,
    language,
    label: getContentLanguageLabel(language),
    title: values.title,
    description: values.description,
    source: "generated" as const,
  }));
}

function toPlainDisplayImages(
  urls: string[],
  keyPrefix: string,
): PropertyDisplayImage[] {
  return urls.map((url, index) => ({
    key: `${keyPrefix}-${index}`,
    crmImageId: null,
    propertyImageIndex: index,
    url,
    show_on_site: false,
    show_on_groups: false,
    show_on_foreign_agents: false,
  }));
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
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <span className="break-all font-mono text-sm text-foreground">{value}</span>
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
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-surface-secondary/60 px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-tertiary-bg text-tertiary sm:size-8">
        <Icon className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
        <span className="truncate text-sm font-medium text-foreground tabular-nums">
          {value}
        </span>
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
  onDeleteIntegrationImages?: (imageIds: number[]) => Promise<void> | void;
  onCreateIntegrationImages?: (
    imageIndexes: number[],
  ) => Promise<void> | void;
  onUpdateEstateWebImageOptions?: (
    imageIds: number[],
    options: EstateWebImageOptions,
  ) => Promise<void> | void;
  isDeletingIntegrationImages?: boolean;
  isCreatingIntegrationImages?: boolean;
  isUpdatingEstateWebImageOptions?: boolean;
  isRemovingWatermark?: boolean;
  canCreateIntegrationImages?: boolean;
  canUpdateEstateWebImageOptions?: boolean;
  canRemoveWatermark?: boolean;
  canMigrateIntegrationImages?: boolean;
  onRemoveWatermark?: (
    imageIds: number[],
    replaceCrmImages: boolean,
  ) => Promise<void> | void;
  onMigrateIntegrationImages?: (
    mode: MigrateIntegrationImagesMode,
  ) => Promise<void> | void;
  isMigratingIntegrationImages?: boolean;
  canReorderIntegrationImages?: boolean;
  onReorderIntegrationImages?: (imageIds: number[]) => Promise<void> | void;
  isReorderingIntegrationImages?: boolean;
  canCopyNormalizedImages?: boolean;
  onCopyNormalizedImages?: (
    imageIndexes: number[],
    removeWatermark: boolean,
  ) => Promise<void> | void;
  isCopyingNormalizedImages?: boolean;
  pendingImageOps?: PendingImageOp[];
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
  onDeleteIntegrationImages,
  onCreateIntegrationImages,
  onUpdateEstateWebImageOptions,
  isDeletingIntegrationImages = false,
  isCreatingIntegrationImages = false,
  isUpdatingEstateWebImageOptions = false,
  canCreateIntegrationImages = false,
  canUpdateEstateWebImageOptions = false,
  canRemoveWatermark = false,
  canMigrateIntegrationImages = false,
  onRemoveWatermark,
  onMigrateIntegrationImages,
  isRemovingWatermark = false,
  isMigratingIntegrationImages = false,
  canReorderIntegrationImages = false,
  onReorderIntegrationImages,
  isReorderingIntegrationImages = false,
  canCopyNormalizedImages = false,
  onCopyNormalizedImages,
  isCopyingNormalizedImages = false,
  pendingImageOps = [],
}: PropertyDetailViewProps) {
  const sourceLinks = property.source_links ?? [];
  const cmsFieldEntries = (property.cms_fields ?? []) as CmsPropertyFieldEntry[];
  const cmsMetadataLines = formatCmsMetadata(property.cms_metadata ?? null);
  const location = formatLocation(property);
  const displayImages = resolvePropertyDisplayImages({
    integrationProperty: property.integration_property,
    fallbackImages: property.images,
  });
  const fallbackImages = (property.images ?? []).filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  const normalizedImages = (property.canonical_images ?? []).filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  const propertyImageIdentities = new Set(
    displayImages.map((image) => normalizeSourceImageIdentity(image.url)),
  );
  const isOriginalOnProperty = (image: PropertyDisplayImage) =>
    propertyImageIdentities.has(normalizeSourceImageIdentity(image.url));
  const heroImage = displayImages[0] ?? null;
  const heroFallback = fallbackImages[0] ?? null;
  const canManageIntegrationImages =
    (Boolean(onDeleteIntegrationImages) &&
      displayImages.some((image) => image.crmImageId != null)) ||
    (canUpdateEstateWebImageOptions &&
      Boolean(onUpdateEstateWebImageOptions) &&
      displayImages.some((image) => image.crmImageId != null)) ||
    (canRemoveWatermark &&
      Boolean(onRemoveWatermark) &&
      displayImages.some((image) => image.crmImageId != null)) ||
    (canMigrateIntegrationImages &&
      Boolean(onMigrateIntegrationImages) &&
      Boolean(property.integration_property_id)) ||
    (canCreateIntegrationImages &&
      Boolean(onCreateIntegrationImages) &&
      Boolean(property.integration_property_id) &&
      fallbackImages.length > 0);
  const canCopyNormalizedImagesToTracked =
    canCopyNormalizedImages &&
    Boolean(onCopyNormalizedImages) &&
    Boolean(property.integration_property_id);
  const originalDisplayImages = toPlainDisplayImages(normalizedImages, "normalized");
  const canCompareOriginals =
    property.canonical_images !== undefined && normalizedImages.length > 0;
  const showAdvancedEditing = canCompareOriginals || canManageIntegrationImages;
  const compareOverlay = useOverlayState();
  const pendingRemoveIds = pendingImageOps.flatMap((op) =>
    op.kind === "remove" ? op.crmImageIds : [],
  );
  const pendingAddCount = pendingImageOps.reduce(
    (sum, op) => (op.kind === "add" ? sum + op.count : sum),
    0,
  );
  const userImagesGridProps: PropertyImagesGridProps = {
    images: displayImages,
    fallbackImages,
    title: property.title,
    selectable: canManageIntegrationImages,
    canCreateFromPropertyImages:
      canCreateIntegrationImages &&
      Boolean(onCreateIntegrationImages) &&
      Boolean(property.integration_property_id),
    canUpdateEstateWebImageOptions:
      canUpdateEstateWebImageOptions && Boolean(onUpdateEstateWebImageOptions),
    canRemoveWatermark: canRemoveWatermark && Boolean(onRemoveWatermark),
    canMigrateIntegrationImages:
      canMigrateIntegrationImages && Boolean(onMigrateIntegrationImages),
    canReorderIntegrationImages,
    onDeleteSelected: onDeleteIntegrationImages,
    onCreateSelected: onCreateIntegrationImages,
    onUpdateEstateWebImageOptions,
    onRemoveWatermark,
    onMigrateIntegrationImages,
    onReorderIntegrationImages,
    isDeletePending: isDeletingIntegrationImages,
    isCreatePending: isCreatingIntegrationImages,
    isUpdateEstateWebImageOptionsPending: isUpdatingEstateWebImageOptions,
    isRemoveWatermarkPending: isRemovingWatermark,
    isMigrateIntegrationImagesPending: isMigratingIntegrationImages,
    isReorderPending: isReorderingIntegrationImages,
    pendingRemoveIds,
    pendingAddCount,
  };
  const primaryLink =
    sourceLinks.find((link) => link.is_primary_source) ?? sourceLinks[0] ?? null;
  const agencyName = primaryLink?.source_property.source_agency?.name ?? null;
  const integrationEmail = property.integration_email?.trim() || null;
  const hasPrice = property.price != null && property.price !== "";
  const crmPropertyAppUrl = property.integration_property_id
    ? getCrmPropertyAppUrl(property.integration_property_id)
    : null;
  const localizedContentRows = buildLocalizedContentRows(property);
  const defaultLocalizedLanguage =
    localizedContentRows.find((row) => row.language === "EL")?.language ??
    localizedContentRows[0]?.language ??
    null;
  const [selectedLocalizedLanguage, setSelectedLocalizedLanguage] = useState<
    string | null
  >(defaultLocalizedLanguage);
  const activeLocalizedLanguage =
    localizedContentRows.some(
      (row) => row.language === selectedLocalizedLanguage,
    )
      ? selectedLocalizedLanguage
      : defaultLocalizedLanguage;
  const selectedLocalizedContent =
    localizedContentRows.find(
      (row) => row.language === activeLocalizedLanguage,
    ) ?? null;

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
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <Link
          to={backHref}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          {backLabel}
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {details ? headerExtra : null}
          {headerActions}
        </div>
      </div>

      {banner}

      {details ?? (
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)] lg:min-h-[22rem]">
            <div className="relative aspect-[4/3] min-h-48 bg-surface-secondary sm:min-h-56 lg:aspect-auto lg:min-h-full">
              {heroImage ? (
                <div className="absolute inset-0">
                  <PropertyPhoto
                    src={heroImage.url}
                    fallbackSrc={heroFallback}
                    alt={property.title}
                    className="size-full object-cover"
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted">
                  <Building2 className="size-10 opacity-40" />
                </div>
              )}
              {displayImages.length > 1 && (
                <span className="absolute bottom-3 left-3 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
                  {displayImages.length} photos
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4 p-4 sm:gap-5 sm:p-6">
              <div className="flex min-w-0 flex-col gap-3">
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
                    <PropertyDuplicateGroupChip groupId={property.duplicate_group_id} />
                  )}
                  {headerExtra}
                </div>

                <div className="flex min-w-0 items-start gap-2">
                  <h1 className="min-w-0 text-xl font-semibold tracking-tight text-foreground text-balance break-words sm:text-2xl">
                    {property.title}
                  </h1>
                  {primaryLink && (
                    <a
                      href={primaryLink.source_property.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 shrink-0 text-muted hover:text-accent"
                      aria-label="Open source listing"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>

                <p className="text-2xl font-semibold tracking-tight text-tertiary tabular-nums break-words sm:text-3xl">
                  {property.price_web
                    ? formatPrice(property.price_web, property.currency)
                    : hasPrice
                      ? formatPrice(property.price, property.currency)
                      : "Price not set"}
                </p>

                {property.price_web && hasPrice && (
                  <p className="text-sm text-muted">
                    First price{" "}
                    <span className="text-foreground tabular-nums">
                      {formatPrice(property.price, property.currency)}
                    </span>
                  </p>
                )}

                {location && (
                  <p className="flex min-w-0 items-start gap-2 text-sm text-muted">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-tertiary" />
                    <span className="min-w-0 break-words">{location}</span>
                  </p>
                )}

                {agencyName ? (
                  <p className="flex min-w-0 items-start gap-2 text-sm text-muted">
                    <Building2 className="mt-0.5 size-4 shrink-0 text-tertiary" />
                    <span className="min-w-0 break-words">{agencyName}</span>
                  </p>
                ) : null}

                {integrationEmail ? (
                  <p className="flex min-w-0 items-start gap-2 text-sm text-muted">
                    <Mail className="mt-0.5 size-4 shrink-0 text-tertiary" />
                    <span className="min-w-0 break-words">{integrationEmail}</span>
                  </p>
                ) : null}
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
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                    CMS ID
                  </span>
                  {crmPropertyAppUrl && property.integration_property_id ? (
                    <a
                      href={crmPropertyAppUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 items-center gap-1.5 font-mono text-sm text-accent hover:underline"
                    >
                      <span className="min-w-0 truncate">{property.integration_property_id}</span>
                      <ExternalLink className="size-3.5 shrink-0" />
                    </a>
                  ) : (
                    <span className="font-mono text-sm text-foreground truncate">
                      {property.integration_property_id ?? "—"}
                    </span>
                  )}
                </div>
                <MetaItem
                  label="Created"
                  value={property.created_at ? formatDateTime(property.created_at) : "—"}
                />
                <MetaItem
                  label="Updated"
                  value={property.updated_at ? formatDateTime(property.updated_at) : "—"}
                />
              </div>

              {(property.price || property.price_web) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  {property.price && (
                    <span>
                      First price{" "}
                      <span className="text-foreground tabular-nums">
                        {formatPrice(property.price, property.currency)}
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
            <div className="border-t border-border px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                Description
              </h2>
              <p className="max-w-3xl text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                {property.description}
              </p>
            </div>
          )}
        </section>
      )}
      {selectedLocalizedContent && (
        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-foreground">
                Localized content
              </h2>
              <span className="text-[11px] text-muted">
                {selectedLocalizedContent.source === "crm"
                  ? "Pushed to CRM"
                  : "Generated (not yet pushed)"}
              </span>
            </div>
            {localizedContentRows.length > 1 ? (
              <Select
                className="w-full max-w-[11rem]"
                selectedKey={activeLocalizedLanguage ?? undefined}
                onSelectionChange={(key) => {
                  if (typeof key === "string") {
                    setSelectedLocalizedLanguage(key);
                  }
                }}
                aria-label="Localized content language"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {localizedContentRows.map((row) => (
                      <ListBox.Item
                        key={row.language}
                        id={row.language}
                        textValue={row.label}
                      >
                        {row.label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : (
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                {selectedLocalizedContent.label}
              </span>
            )}
          </div>
          <div className="min-w-0">
            {selectedLocalizedContent.title ? (
              <p className="mb-2 text-sm font-medium text-foreground break-words">
                {selectedLocalizedContent.title}
              </p>
            ) : null}
            {selectedLocalizedContent.description ? (
              <p className="max-w-3xl text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                {selectedLocalizedContent.description}
              </p>
            ) : null}
          </div>
        </section>
      )}

      <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">CMS & location</h2>
        <div className="grid min-w-0 grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <p className="min-w-0 break-words">
            <span className="text-muted">Property type:</span>{" "}
            {property.estateweb_type_name ?? "—"}
          </p>
          <p className="min-w-0 break-words">
            <span className="text-muted">Energy class:</span>{" "}
            {property.estateweb_energy_class_name ?? "—"}
          </p>
          <p className="min-w-0 break-words">
            <span className="text-muted">Road:</span>{" "}
            {property.estateweb_road_type_name ?? "—"}
          </p>
          {property.estateweb_location_name && (
            <p className="min-w-0 break-words">
              <span className="text-muted">EstateWeb location:</span>{" "}
              {property.estateweb_location_name}
            </p>
          )}
          <p className="min-w-0 break-words">
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
          <p className="min-w-0 break-words">
            <span className="text-muted">Airport distance:</span> {property.distance_airport ?? "—"}
          </p>
          <p className="min-w-0 break-words">
            <span className="text-muted">Port distance:</span> {property.distance_port ?? "—"}
          </p>
          <p className="min-w-0 break-words">
            <span className="text-muted">Beach distance:</span> {property.distance_beach ?? "—"}
          </p>
        </div>
        {cmsFieldEntries.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
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
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">CMS metadata</h3>
            <ul className="flex flex-col gap-1 text-sm text-muted">
              {cmsMetadataLines.map((line) => (
                <li key={line} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {showAdvancedEditing ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onPress={compareOverlay.open}
            >
              <Columns2 className="size-5" />
              Advanced editing
            </Button>
          ) : null}
          <h2 className="text-sm font-semibold text-foreground">Images</h2>
        </div>
        {!displayImages.length ? (
          <p className="text-sm text-muted">No images yet.</p>
        ) : (
          <PropertyImagesGrid
            images={displayImages}
            fallbackImages={fallbackImages}
            title={property.title}
          />
        )}
      </section>

      {showAdvancedEditing ? (
        <PropertyImagesCompareDialog
          state={compareOverlay}
          title={property.title}
          userImagesGridProps={userImagesGridProps}
          originalImages={originalDisplayImages}
          isOriginalOnProperty={isOriginalOnProperty}
          canCopyOriginals={canCopyNormalizedImagesToTracked}
          onCopyOriginals={onCopyNormalizedImages}
          isCopyingOriginals={isCopyingNormalizedImages}
          imageLimit={property.image_limit ?? null}
          trackedImageCount={property.tracked_image_count ?? 0}
        />
      ) : null}

      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
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

      {property.latitude && property.longitude ? (
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">Location</h2>
          <PropertyLocationMap
            latitude={Number(property.latitude)}
            longitude={Number(property.longitude)}
            title={property.title}
          />
        </section>
      ) : null}

      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        {property.history.length === 0 ? (
          <p className="text-sm text-muted">No history yet.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-3">
            {property.history.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "flex min-w-0 flex-col gap-2 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3",
                  showFieldDiff
                    ? "rounded-lg border border-border p-3"
                    : "border-l-2 border-accent/30 py-1 pl-4",
                )}
              >
                <PropertyHistoryChangeLabel
                  entry={entry}
                  className="min-w-0 font-medium text-foreground"
                />
                <span className="shrink-0 text-xs text-muted sm:whitespace-nowrap">
                  {formatDateTime(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {footer}
    </div>
  );
}
