import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integration-type-form.options";

type CmsIntegrationDescriptionProps = {
  context?: "agency" | "connection";
};

export function CmsIntegrationDescription({
  context = "agency",
}: CmsIntegrationDescriptionProps) {
  const label = getIntegrationTypeLabel(IntegrationTypes.ESTATEWEB);
  const description =
    context === "agency"
      ? `Link one ${label} connection to this tracked agency for future property sync.`
      : `Link this ${label} connection to a tracked agency for future property sync.`;

  return (
    <div>
      <p className="text-sm font-medium text-foreground">CMS integration</p>
      <p className="text-xs text-muted">{description}</p>
    </div>
  );
}
