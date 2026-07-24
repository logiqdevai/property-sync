import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Scissors, Unlink, Upload, X, ExternalLink } from "lucide-react";
import { Button, useOverlayState } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import type { TableRowAction } from "@/components/ui/table-row-actions-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TruncateDescriptionDialog } from "@/components/ui/truncate-description-dialog";
import { PropertyDetailView } from "@/components/ui/property-detail-view";
import { getCrmPropertyAppUrl } from "@/config/constants/crm-app-urls";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";
import {
  useEstateWebEnergyClassCatalog,
  useEstateWebFloorCatalog,
  useEstateWebListingTypeCatalog,
  useEstateWebLocationCatalog,
  useEstateWebPropertyTypeCatalog,
  useEstateWebRoadTypeCatalog,
} from "@/features/estateweb/hooks/use-estateweb";
import {
  useMigrateUserPropertyIntegrationImages,
  useDeleteUserPropertyIntegrationImages,
  useCreateUserPropertyIntegrationImages,
  useUpdateUserPropertyIntegrationImages,
  useRemoveUserPropertyWatermarkImages,
  usePushUserPropertyToCrm,
  useTruncateUserPropertyDescriptions,
  useUpdateUserProperty,
  useUserProperty,
} from "@/features/user-properties/hooks/use-user-properties";
import {
  updateUserPropertyFormSchema,
  type UpdateUserPropertyFormValues,
} from "@/features/user-properties/validation-schemas/user-properties.schema";
import { EstateWebFeaturesPickerModal } from "./components/estateweb-features-picker-modal";
import { EstateWebFlatPickerModal } from "./components/estateweb-flat-picker-modal";
import { EstateWebLocationPickerModal } from "./components/estateweb-location-picker-modal";
import { EstateWebPropertyTypePickerModal } from "./components/estateweb-property-type-picker-modal";

const fieldClassName =
  "rounded-lg border border-border bg-background px-3 py-2 placeholder:text-muted";

function resolveScopeIdFromListingType(listingType: string): number | null {
  if (listingType === "RENT" || listingType === "SHORT_TERM_RENT") return 2;
  if (listingType === "SALE") return 1;
  return null;
}

type CatalogFieldProps = {
  label: string;
  displayValue: string | null;
  emptyLabel: string;
  onChoose: () => void;
  onClear: () => void;
  showClear: boolean;
};

function CatalogField({
  label,
  displayValue,
  emptyLabel,
  onChoose,
  onClear,
  showClear,
}: CatalogFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex min-w-0 gap-2">
        <button
          type="button"
          className={`${fieldClassName} flex-1 min-w-0 overflow-hidden cursor-pointer text-left hover:border-accent/50`}
          onClick={onChoose}
          title={displayValue ?? undefined}
        >
          {displayValue ? (
            <span className="block truncate text-sm text-foreground">{displayValue}</span>
          ) : (
            <span className="block truncate text-sm text-muted">{emptyLabel}</span>
          )}
        </button>
        {showClear ? (
          <Button type="button" variant="danger" className="shrink-0" onPress={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardPropertyDetailPage() {
  const { id = "" } = useParams();
  const [isEditing, setIsEditing] = useState(false);
  const truncateConfirm = useOverlayState();
  const unlinkConfirm = useOverlayState();
  const locationPicker = useOverlayState();
  const floorPicker = useOverlayState();
  const energyClassPicker = useOverlayState();
  const roadTypePicker = useOverlayState();
  const listingTypePicker = useOverlayState();
  const propertyTypePicker = useOverlayState();
  const featuresPicker = useOverlayState();
  const role = useAuthStore((state) => state.role);
  const { data: property, isPending } = useUserProperty(id);
  const updateProperty = useUpdateUserProperty();
  const pushToCrm = usePushUserPropertyToCrm();
  const migrateImages = useMigrateUserPropertyIntegrationImages();
  const deleteIntegrationImages = useDeleteUserPropertyIntegrationImages();
  const createIntegrationImages = useCreateUserPropertyIntegrationImages();
  const updateIntegrationImages = useUpdateUserPropertyIntegrationImages();
  const removeWatermarkImages = useRemoveUserPropertyWatermarkImages();
  const truncateDescriptions = useTruncateUserPropertyDescriptions();
  const { data: locationCatalog = [] } = useEstateWebLocationCatalog(isEditing);
  const { data: floorCatalog = [], isPending: floorCatalogPending } =
    useEstateWebFloorCatalog(isEditing);
  const { data: energyClassCatalog = [], isPending: energyClassCatalogPending } =
    useEstateWebEnergyClassCatalog(isEditing);
  const { data: roadTypeCatalog = [], isPending: roadTypeCatalogPending } =
    useEstateWebRoadTypeCatalog(isEditing);
  const { data: listingTypeCatalog = [], isPending: listingTypeCatalogPending } =
    useEstateWebListingTypeCatalog(isEditing);
  const { data: propertyTypeCatalog = [] } = useEstateWebPropertyTypeCatalog(isEditing);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty },
  } = useForm<UpdateUserPropertyFormValues>({
    resolver: zodResolver(updateUserPropertyFormSchema) as Resolver<UpdateUserPropertyFormValues>,
  });

  const estatewebLocationId = watch("estateweb_location_id");
  const estatewebTypeId = watch("estateweb_type_id");
  const estatewebScopeId = watch("estateweb_scope_id");
  const estatewebEnergyClassId = watch("estateweb_energy_class_id");
  const estatewebRoadTypeId = watch("estateweb_road_type_id");
  const floor = watch("floor");
  const features = watch("features");

  const selectedLocationPath = useMemo(() => {
    if (estatewebLocationId == null) return null;
    return locationCatalog.find((location) => location.id === Number(estatewebLocationId))
      ?.path ?? null;
  }, [estatewebLocationId, locationCatalog]);

  const selectedEstatewebPropertyTypePath = useMemo(() => {
    if (estatewebTypeId == null) return null;
    return (
      propertyTypeCatalog.find((type) => type.id === Number(estatewebTypeId))?.path ?? null
    );
  }, [estatewebTypeId, propertyTypeCatalog]);

  const selectedListingTypeLabel = useMemo(() => {
    if (estatewebScopeId == null) return null;
    return (
      listingTypeCatalog.find((entry) => entry.id === Number(estatewebScopeId))
        ?.name ?? null
    );
  }, [estatewebScopeId, listingTypeCatalog]);

  const selectedEnergyClassLabel = useMemo(() => {
    if (estatewebEnergyClassId == null || String(estatewebEnergyClassId) === "") {
      return null;
    }
    return (
      energyClassCatalog.find(
        (entry) => entry.id === Number(estatewebEnergyClassId),
      )?.name ?? null
    );
  }, [estatewebEnergyClassId, energyClassCatalog]);

  const selectedRoadTypeLabel = useMemo(() => {
    if (estatewebRoadTypeId == null || String(estatewebRoadTypeId) === "") {
      return null;
    }
    return (
      roadTypeCatalog.find((entry) => entry.id === Number(estatewebRoadTypeId))
        ?.name ?? null
    );
  }, [estatewebRoadTypeId, roadTypeCatalog]);

  const selectedFloorOptionId = useMemo(() => {
    if (!floor) return null;
    return floorCatalog.find((option) => option.name === floor)?.id ?? null;
  }, [floor, floorCatalog]);

  const featuresSummary = useMemo(() => {
    if (!features || features.length === 0) return null;
    if (features.length === 1) return features[0];
    return `${features.length} selected · ${features.join(", ")}`;
  }, [features]);

  useEffect(() => {
    if (!property) return;
    reset({
      title: property.title,
      description: property.description,
      listing_type: property.listing_type,
      property_type: property.property_type,
      status: property.status,
      price: property.price ? Number(property.price) : null,
      currency: property.currency,
      city: property.city,
      district: property.district,
      address: property.address,
      postal_code: property.postal_code,
      country: property.country,
      square_meters: property.square_meters ? Number(property.square_meters) : null,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      floor: property.floor,
      features: property.features ?? [],
      construction_year: property.construction_year,
      renovation_year: property.renovation_year,
      integration_property_id: property.integration_property_id,
      estateweb_type_id: property.estateweb_type_id,
      estateweb_location_id: property.estateweb_location_id,
      estateweb_scope_id:
        property.estateweb_scope_id ??
        resolveScopeIdFromListingType(property.listing_type),
      estateweb_energy_class_id: property.estateweb_energy_class_id,
      estateweb_road_type_id: property.estateweb_road_type_id,
      video_url: property.video_url,
      distance_airport: property.distance_airport,
      distance_port: property.distance_port,
      distance_beach: property.distance_beach,
      price_start: property.price_start ? Number(property.price_start) : null,
      price_web: property.price_web ? Number(property.price_web) : null,
    });
  }, [property, reset]);

  const isAdmin = role === RoleTypes.ADMIN || role === RoleTypes.SUPER_ADMIN;

  const headerActions = useMemo<TableRowAction[]>(() => {
    if (!property) return [];

    const crmUrl = property.integration_property_id
      ? getCrmPropertyAppUrl(property.integration_property_id)
      : null;

    return [
      {
        id: "push-to-crm",
        label: property.integration_property_id ? "Update CRM" : "Push to CRM",
        variant: "accent",
        icon: Upload,
        isDisabled: isEditing || pushToCrm.isPending,
      },
      ...(crmUrl
        ? [
            {
              id: "open-in-crm",
              label: "Open in CRM",
              variant: "default" as const,
              icon: ExternalLink,
            },
          ]
        : []),
      ...(isAdmin && property.integration_property_id
        ? [
            {
              id: "unlink-from-crm",
              label: "Unlink from CRM",
              variant: "danger" as const,
              icon: Unlink,
              isDisabled: isEditing || updateProperty.isPending,
            },
          ]
        : []),
      {
        id: "truncate",
        label: "Truncate text",
        variant: "warning",
        icon: Scissors,
      },
      isEditing
        ? {
            id: "cancel-edit",
            label: "Cancel edit",
            variant: "danger",
            icon: X,
          }
        : {
            id: "edit",
            label: "Edit",
            variant: "default",
            icon: Pencil,
          },
    ];
  }, [isAdmin, isEditing, property, pushToCrm.isPending, updateProperty.isPending]);

  if (isPending || !property) {
    return <DetailSkeleton />;
  }

  const onSubmit = handleSubmit(async (values) => {
    await updateProperty.mutateAsync({ id: property.id, payload: values });
    setIsEditing(false);
  });

  const handleCancelEdit = () => {
    reset();
    setIsEditing(false);
  };

  const handleTruncate = async ({
    text,
    replacement,
  }: {
    text: string;
    replacement?: string;
  }) => {
    await truncateDescriptions.mutateAsync({
      ids: [property.id],
      text,
      ...(replacement ? { replacement } : {}),
    });
  };

  const handleUnlinkFromCrm = async () => {
    await updateProperty.mutateAsync({
      id: property.id,
      payload: { integration_property_id: null },
    });
  };

  const handleHeaderAction = (actionId: string) => {
    if (actionId === "push-to-crm") {
      pushToCrm.mutate(property.id);
      return;
    }
    if (actionId === "open-in-crm") {
      const crmUrl = property.integration_property_id
        ? getCrmPropertyAppUrl(property.integration_property_id)
        : null;
      if (crmUrl) {
        window.open(crmUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (actionId === "unlink-from-crm") {
      unlinkConfirm.open();
      return;
    }
    if (actionId === "truncate") {
      truncateConfirm.open();
      return;
    }
    if (actionId === "edit") {
      setIsEditing(true);
      return;
    }
    if (actionId === "cancel-edit") {
      handleCancelEdit();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {property.pending_crm_update ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">CRM update pending</p>
            <p className="text-xs text-muted">
              This listing has changes that are not in your CRM yet.
            </p>
          </div>
          <ActionButtonWithPending
            variant="primary"
            isPending={pushToCrm.isPending}
            onPress={() => pushToCrm.mutate(property.id)}
          >
            Update CRM
          </ActionButtonWithPending>
        </div>
      ) : null}

      <PropertyDetailView
        property={property}
        backHref={Routes.dashboard.properties.list}
        backLabel="← Back to my properties"
        showFieldDiff
        onDeleteIntegrationImages={async (imageIds) => {
          await deleteIntegrationImages.mutateAsync({
            id: property.id,
            imageIds,
          });
        }}
        isDeletingIntegrationImages={deleteIntegrationImages.isPending}
        canUpdateEstateWebImageOptions={Boolean(
          property.integration_property_id,
        )}
        onUpdateEstateWebImageOptions={async (imageIds, options) => {
          await updateIntegrationImages.mutateAsync({
            id: property.id,
            image_ids: imageIds,
            ...options,
          });
        }}
        isUpdatingEstateWebImageOptions={updateIntegrationImages.isPending}
        canCreateIntegrationImages={
          role === RoleTypes.ADMIN || role === RoleTypes.SUPER_ADMIN
        }
        onCreateIntegrationImages={async (imageIndexes) => {
          await createIntegrationImages.mutateAsync({
            id: property.id,
            imageIndexes,
          });
        }}
        isCreatingIntegrationImages={createIntegrationImages.isPending}
        canRemoveWatermark={Boolean(property.integration_property_id)}
        onRemoveWatermark={async (imageIds, replaceCrmImages) => {
          await removeWatermarkImages.mutateAsync({
            id: property.id,
            image_ids: imageIds.map(String),
            replace_crm_images: replaceCrmImages,
          });
        }}
        isRemovingWatermark={removeWatermarkImages.isPending}
        canMigrateIntegrationImages={
          (role === RoleTypes.ADMIN || role === RoleTypes.SUPER_ADMIN) &&
          Boolean(property.integration_property_id)
        }
        onMigrateIntegrationImages={async (mode) => {
          await migrateImages.mutateAsync({ id: property.id, mode });
        }}
        isMigratingIntegrationImages={migrateImages.isPending}
        headerActions={
          <BulkActionsMenu
            actions={headerActions}
            onAction={handleHeaderAction}
            isPending={
              pushToCrm.isPending ||
              migrateImages.isPending ||
              deleteIntegrationImages.isPending ||
              createIntegrationImages.isPending ||
              updateIntegrationImages.isPending ||
              removeWatermarkImages.isPending
            }
          />
        }
        details={
          isEditing ? (
            <form
              onSubmit={onSubmit}
              className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4"
            >
              <h2 className="text-sm font-semibold text-foreground">Edit your copy</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-muted">Title</span>
                  <input
                    className={fieldClassName}
                    placeholder="Property title"
                    {...register("title")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-muted">Description</span>
                  <textarea
                    className={`${fieldClassName} min-h-24`}
                    placeholder="Property description"
                    {...register("description")}
                  />
                </label>
                <input type="hidden" {...register("listing_type")} />
                <input type="hidden" {...register("estateweb_scope_id")} />
                <CatalogField
                  label="Listing type"
                  displayValue={selectedListingTypeLabel}
                  emptyLabel="Select listing type"
                  onChoose={listingTypePicker.open}
                  onClear={() => {
                    setValue("estateweb_scope_id", null, {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                    setValue("listing_type", "UNKNOWN", {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                  showClear={estatewebScopeId != null}
                />
                <input type="hidden" {...register("estateweb_type_id")} />
                <CatalogField
                  label="Property type"
                  displayValue={selectedEstatewebPropertyTypePath}
                  emptyLabel="Select property type"
                  onChoose={propertyTypePicker.open}
                  onClear={() => {
                    setValue("estateweb_type_id", null, {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                  showClear={
                    estatewebTypeId != null && String(estatewebTypeId) !== ""
                  }
                />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">City</span>
                  <input
                    className={fieldClassName}
                    placeholder="City"
                    {...register("city")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">District</span>
                  <input
                    className={fieldClassName}
                    placeholder="District or neighborhood"
                    {...register("district")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-muted">Address</span>
                  <input
                    className={fieldClassName}
                    placeholder="Street address"
                    {...register("address")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Postal code</span>
                  <input
                    className={fieldClassName}
                    placeholder="Postal code"
                    {...register("postal_code")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Country</span>
                  <input
                    className={fieldClassName}
                    placeholder="Country"
                    {...register("country")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Price</span>
                  <input
                    type="number"
                    className={fieldClassName}
                    placeholder="0"
                    {...register("price")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Currency</span>
                  <input
                    className={fieldClassName}
                    placeholder="EUR"
                    {...register("currency")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">List price</span>
                  <input
                    type="number"
                    className={fieldClassName}
                    placeholder="0"
                    {...register("price_start")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Web price</span>
                  <input
                    type="number"
                    className={fieldClassName}
                    placeholder="0"
                    {...register("price_web")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Square meters</span>
                  <input
                    type="number"
                    className={fieldClassName}
                    placeholder="0"
                    {...register("square_meters")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Bedrooms</span>
                  <input
                    type="number"
                    className={fieldClassName}
                    placeholder="0"
                    {...register("bedrooms")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Bathrooms</span>
                  <input
                    type="number"
                    className={fieldClassName}
                    placeholder="0"
                    {...register("bathrooms")}
                  />
                </label>
                <input type="hidden" {...register("floor")} />
                <CatalogField
                  label="Floor"
                  displayValue={floor ?? null}
                  emptyLabel="Select floor"
                  onChoose={floorPicker.open}
                  onClear={() => {
                    setValue("floor", null, {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                  showClear={Boolean(floor)}
                />
                <input type="hidden" {...register("estateweb_energy_class_id")} />
                <CatalogField
                  label="Energy class"
                  displayValue={selectedEnergyClassLabel}
                  emptyLabel="Select energy class"
                  onChoose={energyClassPicker.open}
                  onClear={() => {
                    setValue("estateweb_energy_class_id", null, {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                  showClear={
                    estatewebEnergyClassId != null &&
                    String(estatewebEnergyClassId) !== ""
                  }
                />
                <input type="hidden" {...register("estateweb_road_type_id")} />
                <CatalogField
                  label="Road"
                  displayValue={selectedRoadTypeLabel}
                  emptyLabel="Select road type"
                  onChoose={roadTypePicker.open}
                  onClear={() => {
                    setValue("estateweb_road_type_id", null, {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                  showClear={
                    estatewebRoadTypeId != null &&
                    String(estatewebRoadTypeId) !== ""
                  }
                />
                <CatalogField
                  label="Features"
                  displayValue={featuresSummary}
                  emptyLabel="Select features"
                  onChoose={featuresPicker.open}
                  onClear={() => {
                    setValue("features", [], {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                  showClear={Boolean(features && features.length > 0)}
                />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Built</span>
                  <input
                    type="number"
                    className={fieldClassName}
                    placeholder="YYYY"
                    {...register("construction_year")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Renovated</span>
                  <input
                    type="number"
                    className={fieldClassName}
                    placeholder="YYYY"
                    {...register("renovation_year")}
                  />
                </label>
              </div>

              <h3 className="text-sm font-semibold text-foreground pt-2">CMS & integration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-muted">CMS property ID</span>
                  <input
                    className={fieldClassName}
                    placeholder="EstateWeb property ID"
                    {...register("integration_property_id")}
                  />
                </label>
                <input type="hidden" {...register("estateweb_location_id")} />
                <CatalogField
                  label="EstateWeb location"
                  displayValue={selectedLocationPath}
                  emptyLabel="Select location"
                  onChoose={locationPicker.open}
                  onClear={() => {
                    setValue("estateweb_location_id", null, {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                  showClear={
                    estatewebLocationId != null &&
                    String(estatewebLocationId) !== ""
                  }
                />
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-muted">Video URL</span>
                  <input
                    className={fieldClassName}
                    placeholder="https://…"
                    {...register("video_url")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Airport distance</span>
                  <input
                    className={fieldClassName}
                    placeholder="e.g. 15 km"
                    {...register("distance_airport")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Port distance</span>
                  <input
                    className={fieldClassName}
                    placeholder="e.g. 5 km"
                    {...register("distance_port")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Beach distance</span>
                  <input
                    className={fieldClassName}
                    placeholder="e.g. 200 m"
                    {...register("distance_beach")}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <ActionButtonWithPending
                  type="submit"
                  isDisabled={!isDirty}
                  isPending={updateProperty.isPending}
                >
                  Save changes
                </ActionButtonWithPending>
              </div>
            </form>
          ) : undefined
        }
        footer={
          <>
            <TruncateDescriptionDialog
              state={truncateConfirm}
              propertyCount={1}
              onConfirm={handleTruncate}
              isPending={truncateDescriptions.isPending}
            />
            <ConfirmationDialog
              state={unlinkConfirm}
              title="Unlink from CRM?"
              description="This clears the CRM property ID. The listing stays in your CRM; it just stops being linked here."
              confirmLabel="Unlink"
              onConfirm={handleUnlinkFromCrm}
              isPending={updateProperty.isPending}
            />
            <EstateWebLocationPickerModal
              state={locationPicker}
              selectedId={
                estatewebLocationId != null && String(estatewebLocationId) !== ""
                  ? Number(estatewebLocationId)
                  : null
              }
              onSelect={(location) => {
                setValue("estateweb_location_id", location.id, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
              onClear={() => {
                setValue("estateweb_location_id", null, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <EstateWebFlatPickerModal
              state={floorPicker}
              title="Floor"
              searchPlaceholder="Search floor options…"
              emptyLabel="No floor options match."
              items={floorCatalog}
              isPending={floorCatalogPending}
              selectedId={selectedFloorOptionId}
              onSelect={(item) => {
                setValue("floor", item.name, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
              onClear={() => {
                setValue("floor", null, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <EstateWebFlatPickerModal
              state={energyClassPicker}
              title="Energy class"
              searchPlaceholder="Search energy classes…"
              emptyLabel="No energy classes match."
              items={energyClassCatalog}
              isPending={energyClassCatalogPending}
              selectedId={
                estatewebEnergyClassId != null &&
                String(estatewebEnergyClassId) !== ""
                  ? Number(estatewebEnergyClassId)
                  : null
              }
              onSelect={(item) => {
                setValue("estateweb_energy_class_id", Number(item.id), {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
              onClear={() => {
                setValue("estateweb_energy_class_id", null, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <EstateWebFlatPickerModal
              state={roadTypePicker}
              title="Road"
              searchPlaceholder="Search road types…"
              emptyLabel="No road types match."
              items={roadTypeCatalog}
              isPending={roadTypeCatalogPending}
              selectedId={
                estatewebRoadTypeId != null && String(estatewebRoadTypeId) !== ""
                  ? Number(estatewebRoadTypeId)
                  : null
              }
              onSelect={(item) => {
                setValue("estateweb_road_type_id", Number(item.id), {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
              onClear={() => {
                setValue("estateweb_road_type_id", null, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <EstateWebFlatPickerModal
              state={listingTypePicker}
              title="Listing type"
              searchPlaceholder="Search listing types…"
              emptyLabel="No listing types match."
              items={listingTypeCatalog}
              isPending={listingTypeCatalogPending}
              selectedId={
                estatewebScopeId != null && String(estatewebScopeId) !== ""
                  ? Number(estatewebScopeId)
                  : null
              }
              onSelect={(item) => {
                setValue("estateweb_scope_id", Number(item.id), {
                  shouldDirty: true,
                  shouldTouch: true,
                });
                setValue(
                  "listing_type",
                  Number(item.id) === 2 ? "RENT" : "SALE",
                  {
                    shouldDirty: true,
                    shouldTouch: true,
                  },
                );
              }}
              onClear={() => {
                setValue("estateweb_scope_id", null, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
                setValue("listing_type", "UNKNOWN", {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <EstateWebPropertyTypePickerModal
              state={propertyTypePicker}
              selectedId={
                estatewebTypeId != null && String(estatewebTypeId) !== ""
                  ? Number(estatewebTypeId)
                  : null
              }
              onSelect={(propertyTypeEntry) => {
                setValue("estateweb_type_id", propertyTypeEntry.id, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
              onClear={() => {
                setValue("estateweb_type_id", null, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <EstateWebFeaturesPickerModal
              state={featuresPicker}
              selectedNames={features ?? []}
              onApply={(featureNames) => {
                setValue("features", featureNames, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
              onClear={() => {
                setValue("features", [], {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
          </>
        }
      />
    </div>
  );
}
