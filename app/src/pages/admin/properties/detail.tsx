import { Link, useParams } from "react-router-dom";
import { Button, Chip, useOverlayState } from "@heroui/react";
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

  const handleTruncate = async ({
    texts,
    replacement,
  }: {
    texts: string[];
    replacement?: string;
  }) => {
    await truncateDescriptions.mutateAsync({
      property_ids: [property.id],
      texts,
      ...(replacement ? { replacement } : {}),
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
          <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Source properties
            </h2>
            {property.source_links.length === 0 ? (
              <p className="text-sm text-muted">No source properties linked.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {property.source_links.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Link
                      to={Routes.admin.properties.sourceDetail(
                        link.source_property.id,
                      )}
                      className="text-sm text-accent hover:underline font-medium truncate"
                    >
                      {link.source_property.raw_title?.trim() ||
                        link.source_property.property_id ||
                        link.source_property.id}
                    </Link>
                    {link.is_primary_source ? (
                      <Chip size="sm" variant="soft" color="accent">
                        <Chip.Label>Primary</Chip.Label>
                      </Chip>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
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
