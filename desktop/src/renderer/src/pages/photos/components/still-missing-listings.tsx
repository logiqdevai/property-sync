import { Button } from "@heroui/react";
import { ExternalLink, Globe } from "lucide-react";
import { StillMissingReasons, type StillMissingListing, type StillMissingReason } from "@shared/ipc";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { StatusChip, type StatusChipColor } from "@/components/ui/status-chip";
import { useOpenExternal } from "@/features/desktop-app/hooks/use-desktop-app";

const reasonLabels: Record<StillMissingReason, { label: string; color: StatusChipColor }> = {
  [StillMissingReasons.NO_SOURCE_PHOTOS]: { label: "No photos on the website", color: "default" },
  [StillMissingReasons.DOWNLOAD_FAILED]: { label: "Photos could not be downloaded", color: "warning" },
  [StillMissingReasons.UPLOAD_FAILED]: { label: "Upload to EstateWeb failed", color: "danger" },
};

/**
 * Listings whose photos could not be fixed, with a link to each on the agency's website and in
 * EstateWeb, and the EstateWeb account to sign in with, so someone can check them by hand.
 */
export function StillMissingListings({ listings }: { listings: StillMissingListing[] }) {
  const { mutate: openExternal } = useOpenExternal();
  const accounts = [...new Set(listings.map((l) => l.crm_account_email).filter((e): e is string => !!e))];

  return (
    <div className="flex flex-col gap-3">
      {accounts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface-secondary px-3 py-2 text-sm">
          <span className="text-muted">
            EstateWeb account{accounts.length > 1 ? "s" : ""} to sign in with:
          </span>
          {accounts.map((email) => (
            <span key={email} className="inline-flex items-center gap-0.5 font-medium text-foreground">
              {email}
              <CopyIconButton value={email} ariaLabel={`Copy ${email}`} />
            </span>
          ))}
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {listings.map((listing) => {
          const reason = reasonLabels[listing.reason];
          return (
            <li key={listing.user_property_id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium text-foreground">
                  {listing.title || "Untitled listing"}
                </span>
                <StatusChip label={reason.label} color={reason.color} />
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={!listing.source_url}
                  onPress={() => listing.source_url && openExternal(listing.source_url)}
                >
                  <Globe className="size-4" />
                  Website
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={!listing.crm_url}
                  onPress={() => listing.crm_url && openExternal(listing.crm_url)}
                >
                  <ExternalLink className="size-4" />
                  EstateWeb
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
