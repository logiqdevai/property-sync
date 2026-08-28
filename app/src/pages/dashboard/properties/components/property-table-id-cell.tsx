import type { FC } from "react";
import { ExternalLink } from "lucide-react";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { getCrmPropertyAppUrl } from "@/config/constants/crm-app-urls";
import { cn } from "@/lib/utils";

type PropertyTableIdCellProps = {
  internalId: string | null;
  integrationPropertyId: string | null;
  className?: string;
};

export const PropertyTableIdCell: FC<PropertyTableIdCellProps> = ({
  internalId,
  integrationPropertyId,
  className,
}) => {
  const crmPropertyAppUrl = integrationPropertyId
    ? getCrmPropertyAppUrl(integrationPropertyId)
    : null;

  if (!internalId) {
    return <span className="text-sm text-muted">—</span>;
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {crmPropertyAppUrl ? (
        <a
          href={crmPropertyAppUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 font-mono text-sm text-accent hover:underline"
        >
          <span className="truncate">{internalId}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ) : (
        <span className="min-w-0 truncate font-mono text-sm text-foreground">
          {internalId}
        </span>
      )}
      <CopyIconButton
        value={internalId}
        ariaLabel={`Copy internal ID ${internalId}`}
      />
    </div>
  );
};
