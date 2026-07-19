import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Chip, useOverlayState } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import {
  useDeleteSourceProperty,
  useSourceProperty,
} from "@/features/source-properties/hooks/use-source-properties";
import { formatDateTime } from "@/lib/date";

function MetaRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <div className="flex items-start gap-1.5 min-w-0">
        <span className="font-mono text-sm text-foreground break-all">
          {value}
        </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${label}`}
            className="shrink-0 text-accent hover:text-accent/80 transition-colors mt-0.5"
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function SourcePropertyDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const { data: sourceProperty, isPending } = useSourceProperty(id);
  const deleteSourceProperty = useDeleteSourceProperty();

  if (isPending || !sourceProperty) {
    return <DetailSkeleton />;
  }

  const rawFields = [
    { label: "Title", value: sourceProperty.raw_title },
    { label: "Price", value: sourceProperty.raw_price },
    { label: "Location", value: sourceProperty.raw_location },
    { label: "Type", value: sourceProperty.raw_property_type },
    { label: "Listing", value: sourceProperty.raw_listing_type },
    { label: "Sqm", value: sourceProperty.raw_sqm },
    { label: "Bedrooms", value: sourceProperty.raw_bedrooms },
    { label: "Bathrooms", value: sourceProperty.raw_bathrooms },
  ].filter((field): field is { label: string; value: string } =>
    Boolean(field.value && field.value.trim()),
  );

  const handleDelete = async () => {
    await deleteSourceProperty.mutateAsync(sourceProperty.id);
    navigate(Routes.admin.properties.sourceList);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2 min-w-0">
          <Link
            to={Routes.admin.properties.sourceList}
            className="text-sm text-muted hover:text-foreground transition-colors w-fit"
          >
            ← Back to source properties
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {sourceProperty.raw_title?.trim() || sourceProperty.property_id}
            </h1>
            <PropertyStatusChip status={sourceProperty.status} />
          </div>
          <a
            href={sourceProperty.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline truncate max-w-full"
          >
            {sourceProperty.source_url}
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          {sourceProperty.raw_html_url ? (
            <Button
              variant="secondary"
              onPress={() =>
                window.open(sourceProperty.raw_html_url!, "_blank", "noreferrer")
              }
            >
              View raw HTML
            </Button>
          ) : null}
          <Button variant="danger" onPress={deleteConfirm.open}>
            Delete
          </Button>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetaRow label="ID" value={sourceProperty.id} />
          <MetaRow label="Property ID" value={sourceProperty.property_id} />
          {sourceProperty.internal_id ? (
            <MetaRow label="Internal ID" value={sourceProperty.internal_id} />
          ) : null}
          <MetaRow
            label="Agency"
            value={sourceProperty.source_agency.name}
          />
          <MetaRow
            label="Agency URL"
            value={sourceProperty.source_agency.base_url}
          />
          {sourceProperty.canonical_url ? (
            <MetaRow label="Canonical URL" value={sourceProperty.canonical_url} />
          ) : null}
          {sourceProperty.content_hash ? (
            <MetaRow label="Content hash" value={sourceProperty.content_hash} />
          ) : null}
          {sourceProperty.raw_html_path ? (
            <MetaRow
              label="HTML path"
              value={sourceProperty.raw_html_path}
              href={sourceProperty.raw_html_url}
            />
          ) : null}
          <MetaRow
            label="First seen"
            value={formatDateTime(sourceProperty.first_seen_at)}
          />
          {sourceProperty.last_seen_at ? (
            <MetaRow
              label="Last seen"
              value={formatDateTime(sourceProperty.last_seen_at)}
            />
          ) : null}
          <MetaRow
            label="Created"
            value={formatDateTime(sourceProperty.created_at)}
          />
          <MetaRow
            label="Updated"
            value={formatDateTime(sourceProperty.updated_at)}
          />
        </div>
      </section>

      {rawFields.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            Denormalized raw fields
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rawFields.map((field) => (
              <MetaRow key={field.label} label={field.label} value={field.value} />
            ))}
          </div>
        </section>
      ) : null}

      {sourceProperty.raw_description ? (
        <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Raw description
          </h2>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {sourceProperty.raw_description}
          </p>
        </section>
      ) : null}

      {sourceProperty.raw_data != null ? (
        <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Raw data</h2>
          <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-96">
            {JSON.stringify(sourceProperty.raw_data, null, 2)}
          </pre>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">
          Linked properties
        </h2>
        {sourceProperty.property_links.length === 0 ? (
          <p className="text-sm text-muted">No linked normalized properties.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sourceProperty.property_links.map((link) => (
              <div
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <Link
                    to={Routes.admin.properties.detail(link.property.id)}
                    className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate"
                  >
                    {link.property.title}
                  </Link>
                  <span className="font-mono text-xs text-muted">
                    {link.property.id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {link.is_primary_source ? (
                    <Chip size="sm" variant="soft" color="accent">
                      <Chip.Label>Primary</Chip.Label>
                    </Chip>
                  ) : null}
                  <PropertyStatusChip status={link.property.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete this source property?"
        description="This cannot be undone. Linked property source mappings will also be removed."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteSourceProperty.isPending}
      />
    </div>
  );
}
