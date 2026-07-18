import { ExternalLink } from "lucide-react";
import { Chip } from "@heroui/react";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import type { PropertySourceLink } from "@/features/properties/interfaces/properties.interfaces";
import { formatDateTime } from "@/lib/date";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <span className="font-mono text-sm text-foreground break-all">{value}</span>
    </div>
  );
}

function SourcePropertyCard({ link }: { link: PropertySourceLink }) {
  const source = link.source_property;
  const rawFields = [
    { label: "Title", value: source.raw_title },
    { label: "Price", value: source.raw_price },
    { label: "Location", value: source.raw_location },
    { label: "Type", value: source.raw_property_type },
    { label: "Listing", value: source.raw_listing_type },
    { label: "Sqm", value: source.raw_sqm },
    { label: "Bedrooms", value: source.raw_bedrooms },
    { label: "Bathrooms", value: source.raw_bathrooms },
  ].filter((field): field is { label: string; value: string } =>
    Boolean(field.value && field.value.trim()),
  );

  return (
    <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground font-mono truncate">
              {source.id}
            </span>
            {link.is_primary_source ? (
              <Chip size="sm" variant="soft" color="accent">
                <Chip.Label>Primary</Chip.Label>
              </Chip>
            ) : null}
            <PropertyStatusChip status={source.status} />
          </div>
          <a
            href={source.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline truncate"
          >
            {source.source_url}
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        </div>
        {source.raw_html_url ? (
          <a
            href={source.raw_html_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline shrink-0"
          >
            View raw HTML
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <MetaRow label="Property ID" value={source.property_id} />
        {source.internal_id ? (
          <MetaRow label="Internal ID" value={source.internal_id} />
        ) : null}
        {source.content_hash ? (
          <MetaRow label="Content hash" value={source.content_hash} />
        ) : null}
        {source.raw_html_path ? (
          <MetaRow label="HTML path" value={source.raw_html_path} />
        ) : null}
        {source.first_seen_at ? (
          <MetaRow label="First seen" value={formatDateTime(source.first_seen_at)} />
        ) : null}
        {source.last_seen_at ? (
          <MetaRow label="Last seen" value={formatDateTime(source.last_seen_at)} />
        ) : null}
        {source.created_at ? (
          <MetaRow label="Created" value={formatDateTime(source.created_at)} />
        ) : null}
        {source.updated_at ? (
          <MetaRow label="Updated" value={formatDateTime(source.updated_at)} />
        ) : null}
        {link.confidence_score != null ? (
          <MetaRow label="Confidence" value={String(link.confidence_score)} />
        ) : null}
      </div>

      {rawFields.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Denormalized raw fields
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rawFields.map((field) => (
              <MetaRow key={field.label} label={field.label} value={field.value} />
            ))}
          </div>
        </div>
      ) : null}

      {source.raw_description ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Raw description
          </h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {source.raw_description}
          </p>
        </div>
      ) : null}

      {source.raw_data != null ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Raw data
          </h3>
          <pre className="rounded-lg border border-border bg-surface p-3 text-xs overflow-auto max-h-96">
            {JSON.stringify(source.raw_data, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

interface SourcePropertyPanelProps {
  sourceLinks: PropertySourceLink[];
}

export function SourcePropertyPanel({ sourceLinks }: SourcePropertyPanelProps) {
  if (sourceLinks.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Source properties</h2>
        <p className="text-sm text-muted">No source properties linked.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Source properties</h2>
      <div className="flex flex-col gap-4">
        {sourceLinks.map((link) => (
          <SourcePropertyCard key={link.id} link={link} />
        ))}
      </div>
    </section>
  );
}
