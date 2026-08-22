import type { FC } from "react";
import { ExternalLink } from "lucide-react";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { getCrmPropertyAppUrl } from "@/config/constants/crm-app-urls";
import { cn } from "@/lib/utils";

type PropertyTableIdCellProps = {
  propertyId: string;
  integrationPropertyId: string | null;
  className?: string;
};

export const PropertyTableIdCell: FC<PropertyTableIdCellProps> = ({
  propertyId,
  integrationPropertyId,
  className,
}) => {
  const crmPropertyAppUrl = integrationPropertyId
    ? getCrmPropertyAppUrl(integrationPropertyId)
    : null;

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {crmPropertyAppUrl ? (
        <a
          href={crmPropertyAppUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 font-mono text-sm text-accent hover:underline"
        >
          <span className="truncate">{propertyId}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ) : (
        <span className="min-w-0 truncate font-mono text-sm text-foreground">
          {propertyId}
        </span>
      )}
      <CopyIconButton
        value={propertyId}
        ariaLabel={`Copy property ID ${propertyId}`}
      />
    </div>
  );
};
