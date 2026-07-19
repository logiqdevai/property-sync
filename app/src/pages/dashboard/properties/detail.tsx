import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { PropertyDetailView } from "@/components/ui/property-detail-view";
import {
  usePushUserPropertyToCrm,
  useUpdateUserProperty,
  useUserProperty,
} from "@/features/user-properties/hooks/use-user-properties";
import {
  updateUserPropertyFormSchema,
  type UpdateUserPropertyFormValues,
} from "@/features/user-properties/validation-schemas/user-properties.schema";

const fieldClassName = "rounded-lg border border-border bg-background px-3 py-2";

export default function DashboardPropertyDetailPage() {
  const { id = "" } = useParams();
  const [isEditing, setIsEditing] = useState(false);
  const { data: property, isPending } = useUserProperty(id);
  const updateProperty = useUpdateUserProperty();
  const pushToCrm = usePushUserPropertyToCrm();

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
      postal_code: property.postal_code,
      country: property.country,
      square_meters: property.square_meters ? Number(property.square_meters) : null,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      floor: property.floor,
      construction_year: property.construction_year,
      renovation_year: property.renovation_year,
      integration_property_id: property.integration_property_id,
      estateweb_type_id: property.estateweb_type_id,
      estateweb_location_id: property.estateweb_location_id,
      video_url: property.video_url,
      distance_airport: property.distance_airport,
      distance_port: property.distance_port,
      distance_beach: property.distance_beach,
      price_start: property.price_start ? Number(property.price_start) : null,
      price_web: property.price_web ? Number(property.price_web) : null,
    });
  }, [property, reset]);

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
                <input className={fieldClassName} {...register("title")} />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-muted">Description</span>
                <textarea
                  className={`${fieldClassName} min-h-24`}
                  {...register("description")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">City</span>
                <input className={fieldClassName} {...register("city")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">District</span>
                <input className={fieldClassName} {...register("district")} />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-muted">Address</span>
                <input className={fieldClassName} {...register("address")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Postal code</span>
                <input className={fieldClassName} {...register("postal_code")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Country</span>
                <input className={fieldClassName} {...register("country")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Price</span>
                <input type="number" className={fieldClassName} {...register("price")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Currency</span>
                <input className={fieldClassName} {...register("currency")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">List price</span>
                <input type="number" className={fieldClassName} {...register("price_start")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Web price</span>
                <input type="number" className={fieldClassName} {...register("price_web")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Square meters</span>
                <input type="number" className={fieldClassName} {...register("square_meters")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Bedrooms</span>
                <input type="number" className={fieldClassName} {...register("bedrooms")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Bathrooms</span>
                <input type="number" className={fieldClassName} {...register("bathrooms")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Floor</span>
                <input className={fieldClassName} {...register("floor")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Built</span>
                <input type="number" className={fieldClassName} {...register("construction_year")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Renovated</span>
                <input type="number" className={fieldClassName} {...register("renovation_year")} />
              </label>
            </div>

            <h3 className="text-sm font-semibold text-foreground pt-2">CMS & integration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-muted">CMS property ID</span>
                <input
                  className={fieldClassName}
                  placeholder="EstateWeb property id after sync"
                  {...register("integration_property_id")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">EstateWeb type ID</span>
                <input type="number" className={fieldClassName} {...register("estateweb_type_id")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">EstateWeb location ID</span>
                <input
                  type="number"
                  className={fieldClassName}
                  {...register("estateweb_location_id")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-muted">Video URL</span>
                <input className={fieldClassName} {...register("video_url")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Airport distance</span>
                <input className={fieldClassName} {...register("distance_airport")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Port distance</span>
                <input className={fieldClassName} {...register("distance_port")} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Beach distance</span>
                <input className={fieldClassName} {...register("distance_beach")} />
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
    />
    </div>
  );
}
