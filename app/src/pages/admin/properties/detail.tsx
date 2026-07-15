import { useParams } from "react-router-dom";
import { Button, useOverlayState } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PropertyDetailView } from "@/components/ui/property-detail-view";
import { useProperty, useSplitProperty } from "@/features/properties/hooks/use-properties";

export default function PropertyDetailPage() {
  const { id = "" } = useParams();
  const splitConfirm = useOverlayState();
  const { data: property, isPending } = useProperty(id);
  const splitProperty = useSplitProperty();

  if (isPending || !property) {
    return <DetailSkeleton />;
  }

  const handleSplit = async () => {
    await splitProperty.mutateAsync(property.id);
  };

  return (
    <PropertyDetailView
      property={property}
      backHref={Routes.admin.properties.list}
      backLabel="← Back to properties"
      headerActions={
        property.duplicate_group_id ? (
          <Button variant="secondary" onPress={splitConfirm.open}>
            Split from group
          </Button>
        ) : undefined
      }
      footer={
        <ConfirmationDialog
          state={splitConfirm}
          title="Split from duplicate group?"
          description="This property will be removed from its duplicate group. Other grouped properties stay linked."
          confirmLabel="Split"
          onConfirm={handleSplit}
          isPending={splitProperty.isPending}
        />
      }
    />
  );
}
