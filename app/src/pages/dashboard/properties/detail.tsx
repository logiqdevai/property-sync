import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Chip, useOverlayState } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { PropertyDetailView } from "@/components/ui/property-detail-view";
import {
  useResyncUserProperty,
  useUpdateUserProperty,
  useUserProperty,
} from "@/features/user-properties/hooks/use-user-properties";
import {
  updateUserPropertyFormSchema,
  type UpdateUserPropertyFormValues,
} from "@/features/user-properties/validation-schemas/user-properties.schema";

export default function DashboardPropertyDetailPage() {
  const { id = "" } = useParams();
  const [isEditing, setIsEditing] = useState(false);
  const resyncConfirm = useOverlayState();
  const { data: property, isPending } = useUserProperty(id);
  const updateProperty = useUpdateUserProperty();
  const resyncProperty = useResyncUserProperty();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<UpdateUserPropertyFormValues>({
    resolver: zodResolver(updateUserPropertyFormSchema) as Resolver<UpdateUserPropertyFormValues>,
  });

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
      square_meters: property.square_meters ? Number(property.square_meters) : null,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      floor: property.floor,
      construction_year: property.construction_year,
    });
  }, [property, reset]);

  if (isPending || !property) {
    return <DetailSkeleton />;
  }

  const onSubmit = handleSubmit(async (values) => {
    await updateProperty.mutateAsync({ id: property.id, payload: values });
    setIsEditing(false);
  });

  const handleResync = async () => {
    await resyncProperty.mutateAsync(property.id);
  };

  const handleCancelEdit = () => {
    reset();
    setIsEditing(false);
  };

  return (
    <PropertyDetailView
      property={property}
      backHref={Routes.dashboard.properties.list}
      backLabel="← Back to my properties"
      showFieldDiff
      headerExtra={
        property.is_modified ? (
          <Chip size="sm" variant="soft" color="warning">
            <Chip.Label>Edited</Chip.Label>
          </Chip>
        ) : undefined
      }
      headerActions={
        isEditing ? (
          <Button variant="secondary" onPress={handleCancelEdit}>
            Cancel
          </Button>
        ) : (
          <Button variant="secondary" onPress={() => setIsEditing(true)}>
            Edit
          </Button>
        )
      }
      banner={
        property.is_modified ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">
              This listing has been edited and will no longer auto-update from the source.
            </p>
            <Button variant="secondary" onPress={resyncConfirm.open}>
              Resync from source
            </Button>
          </div>
        ) : undefined
      }
      details={
        isEditing ? (
          <form
            onSubmit={onSubmit}
            className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4"
          >
            <h2 className="text-sm font-semibold text-foreground">Edit your copy</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-muted">Title</span>
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("title")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-muted">Description</span>
                <textarea
                  className="rounded-lg border border-border bg-background px-3 py-2 min-h-24"
                  {...register("description")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">City</span>
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("city")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">District</span>
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("district")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-muted">Address</span>
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("address")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Price</span>
                <input
                  type="number"
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("price")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Currency</span>
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("currency")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Square meters</span>
                <input
                  type="number"
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("square_meters")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Bedrooms</span>
                <input
                  type="number"
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("bedrooms")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Bathrooms</span>
                <input
                  type="number"
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("bathrooms")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Floor</span>
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("floor")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Built</span>
                <input
                  type="number"
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  {...register("construction_year")}
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
        <ConfirmationDialog
          state={resyncConfirm}
          title="Resync from source?"
          description="This will discard your local edits and overwrite this copy with the latest canonical data."
          confirmLabel="Resync"
          onConfirm={handleResync}
          isPending={resyncProperty.isPending}
        />
      }
    />
  );
}
