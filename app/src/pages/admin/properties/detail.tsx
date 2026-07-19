import { useParams } from "react-router-dom";
import { Button, useOverlayState } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TruncateDescriptionDialog } from "@/components/ui/truncate-description-dialog";
import { PropertyDetailView } from "@/components/ui/property-detail-view";
import {
  useProperty,
  useSplitProperty,
  useTruncatePropertyDescriptions,
} from "@/features/properties/hooks/use-properties";
import { SourcePropertyPanel } from "./components/source-property-panel";

export default function PropertyDetailPage() {
  const { id = "" } = useParams();
  const splitConfirm = useOverlayState();
  const truncateConfirm = useOverlayState();
  const { data: property, isPending } = useProperty(id);
  const splitProperty = useSplitProperty();
  const truncateDescriptions = useTruncatePropertyDescriptions();

  if (isPending || !property) {
    return <DetailSkeleton />;
  }

  const handleSplit = async () => {
    await splitProperty.mutateAsync(property.id);
  };

  const handleTruncate = async (text: string) => {
    await truncateDescriptions.mutateAsync({
      property_ids: [property.id],
      text,
    });
  };

  return (
    <PropertyDetailView
      property={property}
      backHref={Routes.admin.properties.list}
      backLabel="← Back to properties"
      headerActions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onPress={truncateConfirm.open}>
            Truncate text
          </Button>
          {property.duplicate_group_id ? (
            <Button variant="secondary" onPress={splitConfirm.open}>
              Split from group
            </Button>
          ) : null}
        </div>
      }
      footer={
        <>
          <SourcePropertyPanel sourceLinks={property.source_links} />
          <ConfirmationDialog
            state={splitConfirm}
            title="Split from duplicate group?"
            description="This property will be removed from its duplicate group. Other grouped properties stay linked."
            confirmLabel="Split"
            onConfirm={handleSplit}
            isPending={splitProperty.isPending}
          />
          <TruncateDescriptionDialog
            state={truncateConfirm}
            propertyCount={1}
            onConfirm={handleTruncate}
            isPending={truncateDescriptions.isPending}
          />
        </>
      }
    />
  );
}
