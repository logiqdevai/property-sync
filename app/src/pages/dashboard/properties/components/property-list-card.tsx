import { Link } from "react-router-dom";
import { Button, Checkbox, Chip } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import {
  TableRowActionsMenu,
  type TableRowActionEntry,
} from "@/components/ui/table-row-actions-menu";
import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";
import { formatPrice } from "@/lib/price";
import { getDuplicateGroupRowClasses } from "@/lib/duplicate-group-color.utils";
import { cn } from "@/lib/utils";
import type { PropertiesListLocationState } from "../hooks/use-properties-list-filters";

type PropertyListCardProps = {
  id: string;
  title: string;
  agencyName: string | null;
  city: string | null;
  price: string | null;
  currency: string | null;
  status: PropertyStatus;
  pendingCrmUpdate: boolean;
  integrationPropertyId: string | null;
  duplicateGroupId: string | null;
  isSelected: boolean;
  onSelectionChange: (selected: boolean) => void;
  rowActions: TableRowActionEntry[];
  onAction: (actionId: string) => void;
  isPushPending: boolean;
  onPushToCrm: () => void;
  detailLinkState?: PropertiesListLocationState;
};

export function PropertyListCard({
  id,
  title,
  agencyName,
  city,
  price,
  currency,
  status,
  pendingCrmUpdate,
  integrationPropertyId,
  duplicateGroupId,
  isSelected,
  onSelectionChange,
  rowActions,
  onAction,
  isPushPending,
  onPushToCrm,
  detailLinkState,
}: PropertyListCardProps) {
  const isRemoved = status === PropertyStatuses.REMOVED;
  const groupClass = duplicateGroupId
    ? getDuplicateGroupRowClasses(duplicateGroupId)
    : undefined;

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-surface p-4",
        groupClass,
        isRemoved && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          aria-label={`Select ${title}`}
          isSelected={isSelected}
          onChange={onSelectionChange}
          className="mt-0.5 shrink-0"
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox.Content>
        </Checkbox>
        <div className="min-w-0 flex-1">
          <Link
            to={Routes.dashboard.properties.detail(id)}
            state={detailLinkState}
            className={cn(
              "text-base font-semibold text-foreground break-words hover:text-accent transition-colors",
              isRemoved && "line-through",
            )}
          >
            {title}
          </Link>
          <p className="mt-0.5 truncate text-sm text-muted">
            {[agencyName, city].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <TableRowActionsMenu
          actions={rowActions}
          onAction={onAction}
          ariaLabel={`Actions for ${title}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-8">
        <span className="text-sm font-medium text-foreground">
          {formatPrice(price, currency)}
        </span>
        <PropertyStatusChip status={status} />
      </div>

      <div className="flex min-w-0 flex-col gap-2 border-t border-border pt-3 pl-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted">CRM</span>
          {pendingCrmUpdate ? (
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="soft" color="warning">
                Pending
              </Chip>
              <Button
                size="sm"
                variant="secondary"
                isPending={isPushPending}
                onPress={onPushToCrm}
                className="shrink-0"
              >
                Update CRM
              </Button>
            </div>
          ) : integrationPropertyId ? (
            <Chip size="sm" variant="soft" color="success">
              Synced
            </Chip>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted">Integration ID</span>
          <span className="break-all text-sm text-foreground">
            {integrationPropertyId ?? "—"}
          </span>
        </div>
      </div>
    </article>
  );
}
