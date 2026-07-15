import { Link, useParams } from "react-router-dom";
import { Button, Chip, useOverlayState } from "@heroui/react";
import { ExternalLink, Layers } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PropertyStatusChip } from "./components/property-status-chip";
import { useProperty, useSplitProperty } from "@/features/properties/hooks/use-properties";
import { formatPropertyHistoryLabel } from "@/features/properties/utils/format-property-history";
import { formatDateTime } from "@/lib/date";

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
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-3">
          <Link
            to={Routes.admin.properties.list}
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            ← Back to properties
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {property.title}
            </h1>
            <PropertyStatusChip status={property.status} />
            <Chip size="sm" variant="soft">
              <Chip.Label>{property.listing_type.replace(/_/g, " ")}</Chip.Label>
            </Chip>
            <Chip size="sm" variant="soft">
              <Chip.Label>{property.property_type.replace(/_/g, " ")}</Chip.Label>
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
          </div>
          <p className="text-lg text-foreground">
            {property.price
              ? `${property.price} ${property.currency ?? "EUR"}`
              : "Price not set"}
          </p>
        </div>

        {property.duplicate_group_id && (
          <Button variant="secondary" onPress={splitConfirm.open}>
            Split from group
          </Button>
        )}
      </div>

      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <p>
            <span className="text-muted">City:</span> {property.city ?? "—"}
          </p>
          <p>
            <span className="text-muted">District:</span> {property.district ?? "—"}
          </p>
          <p>
            <span className="text-muted">Address:</span> {property.address ?? "—"}
          </p>
          <p>
            <span className="text-muted">Size:</span>{" "}
            {property.square_meters ? `${property.square_meters} m²` : "—"}
          </p>
          <p>
            <span className="text-muted">Bedrooms:</span> {property.bedrooms ?? "—"}
          </p>
          <p>
            <span className="text-muted">Bathrooms:</span> {property.bathrooms ?? "—"}
          </p>
          <p>
            <span className="text-muted">Floor:</span> {property.floor ?? "—"}
          </p>
          <p>
            <span className="text-muted">Built:</span> {property.construction_year ?? "—"}
          </p>
        </div>
        {property.description && (
          <p className="text-sm text-muted leading-relaxed">{property.description}</p>
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
        <h2 className="text-sm font-semibold text-foreground">Source links</h2>
        {property.source_links.length === 0 ? (
          <p className="text-sm text-muted">No linked source listings.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {property.source_links.map((link) => (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 text-sm border border-border rounded-lg p-3"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium truncate">
                    {link.source_property.raw_title ?? link.source_property.source_url}
                  </span>
                  <span className="text-muted truncate">{link.source_property.source_url}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {link.is_primary_source && (
                    <Chip size="sm" variant="soft" color="success">
                      <Chip.Label>Primary</Chip.Label>
                    </Chip>
                  )}
                  <a
                    href={link.source_property.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:opacity-80"
                    aria-label="Open source listing"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        {property.history.length === 0 ? (
          <p className="text-sm text-muted">No history yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {property.history.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-4 text-sm border-l-2 border-accent/30 pl-4 py-1"
              >
                <span className="text-foreground">{formatPropertyHistoryLabel(entry)}</span>
                <span className="text-muted shrink-0">{formatDateTime(entry.created_at)}</span>
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
    </div>
  );
}
