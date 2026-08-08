import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, Chip, ListBox, Select, useOverlayState } from "@heroui/react";
import {
  Bath,
  BedDouble,
  Building2,
  Calendar,
  ExternalLink,
  Eye,
  Images,
  Mail,
  MapPin,
  Maximize2,
  Ruler,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getCrmPropertyAppUrl } from "@/config/constants/crm-app-urls";
import { ListingTypeFilterOptions } from "@/config/constants/dropdowns/properties/listing-type-filter.options";
import { PropertyTypeFilterOptions } from "@/config/constants/dropdowns/properties/property-type-filter.options";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import { PropertyDuplicateGroupChip } from "@/components/ui/property-duplicate-group-chip";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  EstateWebImageOptionsModal,
  type EstateWebImageOptions,
} from "@/components/ui/estateweb-image-options-modal";
import { RemoveWatermarkModal } from "@/components/ui/remove-watermark-modal";
import { MigrateIntegrationImagesModal } from "@/components/ui/migrate-integration-images-modal";
import type { TableRowAction } from "@/components/ui/table-row-actions-menu";
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
import type { PropertyLocalizedContent } from "@/features/user-properties/interfaces/user-properties.interfaces";
import { getContentLanguageLabel } from "@/config/constants/dropdowns/agencies/content-language-form.options";
import {
  resolvePropertyDisplayImages,
  type PropertyDisplayImage,
} from "@/features/integration-property/utils/resolve-property-display-images";
import { PropertyHistoryChangeLabel } from "@/components/ui/property-history-change-label";
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
  square_meters: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  construction_year: number | null;
  renovation_year?: number | null;
  features: string[] | null;
  images: string[] | null;
  integration_property?: IntegrationProperty | null;
  localized_contents?: PropertyLocalizedContent[];
  duplicate_group_id?: string | null;
  source_links?: PropertySourceLink[];
  history: PropertyHistoryEntry[];
  integration_email?: string | null;
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

function PropertyPhoto({
  src,
  fallbackSrc,
  alt,
  className,
}: {
  src: string;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  return (
    <a
      href={currentSrc}
      target="_blank"
      rel="noreferrer"
      className="block size-full"
    >
      <img
        src={currentSrc}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={className}
        onError={() => {
          if (fallbackSrc && currentSrc !== fallbackSrc) {
            setCurrentSrc(fallbackSrc);
          }
        }}
      />
    </a>
  );
}

function PropertyImagesGrid({
  images,
  fallbackImages,
  title,
  selectable = false,
  canCreateFromPropertyImages = false,
  canUpdateEstateWebImageOptions = false,
  canRemoveWatermark = false,
  canMigrateIntegrationImages = false,
  onDeleteSelected,
  onCreateSelected,
  onUpdateEstateWebImageOptions,
  onRemoveWatermark,
  onMigrateIntegrationImages,
  isDeletePending = false,
  isCreatePending = false,
  isUpdateEstateWebImageOptionsPending = false,
  isRemoveWatermarkPending = false,
  isMigrateIntegrationImagesPending = false,
}: {
  images: PropertyDisplayImage[];
  fallbackImages: string[];
  title: string;
  selectable?: boolean;
  canCreateFromPropertyImages?: boolean;
  canUpdateEstateWebImageOptions?: boolean;
  canRemoveWatermark?: boolean;
  canMigrateIntegrationImages?: boolean;
  onDeleteSelected?: (imageIds: number[]) => Promise<void> | void;
  onCreateSelected?: (imageIndexes: number[]) => Promise<void> | void;
  onUpdateEstateWebImageOptions?: (
    imageIds: number[],
    options: EstateWebImageOptions,
  ) => Promise<void> | void;
  onRemoveWatermark?: (
    imageIds: number[],
    replaceCrmImages: boolean,
  ) => Promise<void> | void;
  onMigrateIntegrationImages?: (
    mode: MigrateIntegrationImagesMode,
  ) => Promise<void> | void;
  isDeletePending?: boolean;
  isCreatePending?: boolean;
  isUpdateEstateWebImageOptionsPending?: boolean;
  isRemoveWatermarkPending?: boolean;
  isMigrateIntegrationImagesPending?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    new Set(),
  );
  const deleteConfirm = useOverlayState();
  const createConfirm = useOverlayState();
  const estateWebOptionsModal = useOverlayState();
  const removeWatermarkModal = useOverlayState();
  const migrateIntegrationImagesModal = useOverlayState();
  const canExpand = images.length > 2;
  const isPending =
    isDeletePending ||
    isCreatePending ||
    isUpdateEstateWebImageOptionsPending ||
    isRemoveWatermarkPending ||
    isMigrateIntegrationImagesPending;
  const canSelect =
    selectable &&
    images.length > 0 &&
    (Boolean(onDeleteSelected) ||
      (canCreateFromPropertyImages && Boolean(onCreateSelected)) ||
      (canUpdateEstateWebImageOptions &&
        Boolean(onUpdateEstateWebImageOptions)) ||
      (canRemoveWatermark && Boolean(onRemoveWatermark)));
  const canMigrate =
    canMigrateIntegrationImages && Boolean(onMigrateIntegrationImages);
  const showToolbar = canSelect || canMigrate;
  const allSelected =
    canSelect &&
    images.length > 0 &&
    images.every((_, index) => selectedIndexes.has(index));
  const selectedCount = selectedIndexes.size;
  const selectedCrmIds = [
    ...new Set(
      [...selectedIndexes]
        .map((index) => images[index]?.crmImageId)
        .filter((id): id is number => id != null),
    ),
  ];
  const selectedCrmImages = images.filter(
    (image, index) =>
      selectedIndexes.has(index) && image.crmImageId != null,
  );
  const selectedEstateWebOptions: EstateWebImageOptions =
    selectedCrmImages.length === 0
      ? {
          show_on_site: false,
          show_on_groups: false,
          show_on_foreign_agents: false,
        }
      : {
          show_on_site: selectedCrmImages.every((image) => image.show_on_site),
          show_on_groups: selectedCrmImages.every(
            (image) => image.show_on_groups,
          ),
          show_on_foreign_agents: selectedCrmImages.every(
            (image) => image.show_on_foreign_agents,
          ),
        };
  const selectedPropertyIndexes = [
    ...new Set(
      [...selectedIndexes]
        .map((index) => images[index]?.propertyImageIndex)
        .filter((index): index is number => index != null),
    ),
  ].sort((a, b) => a - b);

  const selectAll = () => {
    setSelectedIndexes(new Set(images.map((_, index) => index)));
  };

  const deselectAll = () => {
    setSelectedIndexes(new Set());
  };

  const bulkActions: TableRowAction[] = [
    ...(canMigrate
      ? [
          {
            id: "migrate-crm-images",
            label: "Migrate CRM images",
            variant: "accent" as const,
            icon: Images,
            isDisabled: isPending,
          },
        ]
      : []),
    ...(canUpdateEstateWebImageOptions && onUpdateEstateWebImageOptions
      ? [
          {
            id: "estateweb-options",
            label: `EstateWeb options${selectedCrmIds.length > 0 ? ` (${selectedCrmIds.length})` : ""}`,
            variant: "accent" as const,
            icon: Eye,
            isDisabled: isPending || selectedCrmIds.length === 0,
          },
        ]
      : []),
    ...(canCreateFromPropertyImages && onCreateSelected
      ? [
          {
            id: "create-from-property",
            label: `Upload to CRM${selectedPropertyIndexes.length > 0 ? ` (${selectedPropertyIndexes.length})` : ""}`,
            variant: "accent" as const,
            icon: Images,
            isDisabled: isPending || selectedPropertyIndexes.length === 0,
          },
        ]
      : []),
    ...(canRemoveWatermark && onRemoveWatermark
      ? [
          {
            id: "remove-watermark",
            label: `Remove watermark${selectedCrmIds.length > 0 ? ` (${selectedCrmIds.length})` : ""}`,
            variant: "accent" as const,
            icon: Sparkles,
            isDisabled: isPending || selectedCrmIds.length === 0,
          },
        ]
      : []),
    ...(onDeleteSelected
      ? [
          {
            id: "delete",
            label: `Delete${selectedCrmIds.length > 0 ? ` (${selectedCrmIds.length})` : ""}`,
            variant: "danger" as const,
            icon: Trash2,
            isDisabled: isPending || selectedCrmIds.length === 0,
          },
        ]
      : []),
  ];

  const showActionsMenu =
    bulkActions.length > 0 && (canMigrate || selectedCount > 0);

  const handleDeleteConfirm = async () => {
    if (!onDeleteSelected || selectedCrmIds.length === 0) return;
    await onDeleteSelected(selectedCrmIds);
    setSelectedIndexes(new Set());
  };

  const handleCreateConfirm = async () => {
    if (!onCreateSelected || selectedPropertyIndexes.length === 0) return;
    await onCreateSelected(selectedPropertyIndexes);
    setSelectedIndexes(new Set());
  };

  const handleEstateWebOptionsConfirm = async (
    options: EstateWebImageOptions,
  ) => {
    if (!onUpdateEstateWebImageOptions || selectedCrmIds.length === 0) return;
    await onUpdateEstateWebImageOptions(selectedCrmIds, options);
    setSelectedIndexes(new Set());
  };

  const handleRemoveWatermarkConfirm = async (replaceCrmImages: boolean) => {
    if (!onRemoveWatermark || selectedCrmIds.length === 0) return;
    await onRemoveWatermark(selectedCrmIds, replaceCrmImages);
    setSelectedIndexes(new Set());
  };

  const handleMigrateConfirm = async (mode: MigrateIntegrationImagesMode) => {
    if (!onMigrateIntegrationImages) return;
    await onMigrateIntegrationImages(mode);
  };

  return (
    <div className="@container flex flex-col gap-3">
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {canSelect ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled={isPending || images.length === 0}
              onPress={allSelected ? deselectAll : selectAll}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
          ) : null}
          {showActionsMenu ? (
            <BulkActionsMenu
              actions={bulkActions}
              onAction={(actionId) => {
                if (actionId === "migrate-crm-images")
                  migrateIntegrationImagesModal.open();
                if (actionId === "delete") deleteConfirm.open();
                if (actionId === "create-from-property") createConfirm.open();
                if (actionId === "estateweb-options")
                  estateWebOptionsModal.open();
                if (actionId === "remove-watermark")
                  removeWatermarkModal.open();
              }}
              isPending={isPending}
              label="Actions"
            />
          ) : null}
          {selectedCount > 0 ? (
            <span className="text-xs text-muted">{selectedCount} selected</span>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3",
          expanded
            ? "overflow-y-auto max-h-[calc(3*((100cqi-0.75rem)/2)+1.5rem)] sm:max-h-[calc(3*((100cqi-1.5rem)/3)+1.5rem)] md:max-h-[calc(3*((100cqi-2.25rem)/4)+1.5rem)]"
            : "overflow-hidden max-h-[calc((100cqi-0.75rem)/2)] sm:max-h-[calc((100cqi-1.5rem)/3)] md:max-h-[calc((100cqi-2.25rem)/4)]",
        )}
      >
        {images.map((image, index) => {
          const isSelected = selectedIndexes.has(index);
          const showCheckbox = canSelect;

          return (
            <div
              key={image.key}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border transition-colors",
                isSelected
                  ? "border-accent ring-2 ring-accent/40"
                  : "border-border hover:border-accent/50",
              )}
            >
              <PropertyPhoto
                src={image.url}
                fallbackSrc={fallbackImages[index] ?? fallbackImages[0] ?? null}
                alt={`${title} photo ${index + 1}`}
                className="size-full object-cover"
              />
              {showCheckbox ? (
                <div
                  className={cn(
                    "absolute left-2 top-2 z-10 transition-opacity",
                    isSelected || selectedCount > 0
                      ? "opacity-100"
                      : "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100",
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    aria-label={`Select photo ${index + 1}`}
                    isSelected={isSelected}
                    onChange={(selected) => {
                      setSelectedIndexes((current) => {
                        const next = new Set(current);
                        if (selected) next.add(index);
                        else next.delete(index);
                        return next;
                      });
                    }}
                    className="rounded-md bg-background/90 p-1 shadow-sm backdrop-blur-sm"
                  >
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox.Content>
                  </Checkbox>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {canExpand ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onPress={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
      {onDeleteSelected ? (
        <ConfirmationDialog
          state={deleteConfirm}
          title={`Delete ${selectedCrmIds.length} CRM ${selectedCrmIds.length === 1 ? "image" : "images"}?`}
          description="Selected images will be removed from the linked CRM and refreshed locally."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          isPending={isDeletePending}
        />
      ) : null}
      {canCreateFromPropertyImages && onCreateSelected ? (
        <ConfirmationDialog
          state={createConfirm}
          title={`Upload ${selectedPropertyIndexes.length} ${selectedPropertyIndexes.length === 1 ? "photo" : "photos"} to CRM?`}
          description="Selected scraped photos will be uploaded to the linked CRM."
          confirmLabel="Upload"
          onConfirm={handleCreateConfirm}
          isPending={isCreatePending}
        />
      ) : null}
      {canUpdateEstateWebImageOptions && onUpdateEstateWebImageOptions ? (
        <EstateWebImageOptionsModal
          state={estateWebOptionsModal}
          selectedCount={selectedCrmIds.length}
          initialOptions={selectedEstateWebOptions}
          onConfirm={handleEstateWebOptionsConfirm}
          isPending={isUpdateEstateWebImageOptionsPending}
        />
      ) : null}
      {canRemoveWatermark && onRemoveWatermark ? (
        <RemoveWatermarkModal
          state={removeWatermarkModal}
          selectedCount={selectedCrmIds.length}
          onConfirm={handleRemoveWatermarkConfirm}
          isPending={isRemoveWatermarkPending}
        />
      ) : null}
      {canMigrate ? (
        <MigrateIntegrationImagesModal
          state={migrateIntegrationImagesModal}
          onConfirm={handleMigrateConfirm}
          isPending={isMigrateIntegrationImagesPending}
        />
      ) : null}
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
                  {hasPrice
                    ? formatPrice(property.price, property.currency)
                    : "Price not set"}
                </p>

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
              </div>

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
        <h2 className="text-sm font-semibold text-foreground">Images</h2>
        {!displayImages.length ? (
          canMigrateIntegrationImages && onMigrateIntegrationImages ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">No images yet.</p>
              <PropertyImagesGrid
                images={[]}
                fallbackImages={fallbackImages}
                title={property.title}
                canMigrateIntegrationImages
                onMigrateIntegrationImages={onMigrateIntegrationImages}
                isMigrateIntegrationImagesPending={isMigratingIntegrationImages}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">No images yet.</p>
          )
        ) : (
          <PropertyImagesGrid
            images={displayImages}
            fallbackImages={fallbackImages}
            title={property.title}
            selectable={canManageIntegrationImages}
            canCreateFromPropertyImages={
              canCreateIntegrationImages &&
              Boolean(onCreateIntegrationImages) &&
              Boolean(property.integration_property_id)
            }
            canUpdateEstateWebImageOptions={
              canUpdateEstateWebImageOptions &&
              Boolean(onUpdateEstateWebImageOptions)
            }
            canRemoveWatermark={
              canRemoveWatermark && Boolean(onRemoveWatermark)
            }
            canMigrateIntegrationImages={
              canMigrateIntegrationImages &&
              Boolean(onMigrateIntegrationImages)
            }
            onDeleteSelected={onDeleteIntegrationImages}
            onCreateSelected={onCreateIntegrationImages}
            onUpdateEstateWebImageOptions={onUpdateEstateWebImageOptions}
            onRemoveWatermark={onRemoveWatermark}
            onMigrateIntegrationImages={onMigrateIntegrationImages}
            isDeletePending={isDeletingIntegrationImages}
            isCreatePending={isCreatingIntegrationImages}
            isUpdateEstateWebImageOptionsPending={
              isUpdatingEstateWebImageOptions
            }
            isRemoveWatermarkPending={isRemovingWatermark}
            isMigrateIntegrationImagesPending={isMigratingIntegrationImages}
          />
        )}
      </section>

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
