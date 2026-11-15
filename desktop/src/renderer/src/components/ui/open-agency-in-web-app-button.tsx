import { Button, Tooltip } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { environments } from "@/config/environments";
import { WebAppRoutes } from "@/config/api/routes";
import { useOpenExternal } from "@/features/desktop-app/hooks/use-desktop-app";

interface OpenAgencyInWebAppButtonProps {
  agencyId: string;
  agencyName: string;
}

/** Opens the agency's page of the Property Sync web app in the user's normal browser. */
export function OpenAgencyInWebAppButton({ agencyId, agencyName }: OpenAgencyInWebAppButtonProps) {
  const { mutate: openExternal } = useOpenExternal();

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={`Open ${agencyName} in Property Sync`}
          onPress={() => openExternal(`${environments.APP_URL}${WebAppRoutes.adminAgency(agencyId)}`)}
        >
          <ExternalLink className="size-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content className="px-2 py-1 text-xs">Open in Property Sync</Tooltip.Content>
    </Tooltip>
  );
}
