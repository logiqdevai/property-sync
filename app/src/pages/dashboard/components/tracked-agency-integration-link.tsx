import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListBox, Label, Select, Skeleton, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { CredentialStatusIndicators } from "@/pages/dashboard/agencies/components/integration-credential-fields";
import { useUserIntegrationConnections } from "@/features/user-integrations/hooks/use-user-integrations";
import {
  useLinkIntegration,
  useUnlinkIntegration,
} from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import {
  getIntegrationConnectionLabel,
  getLinkableConnections,
} from "@/features/user-tracked-agencies/utils/integration-link.utils";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integrations/integration-type-form.options";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { Routes } from "@/routes/routes";
import { CmsIntegrationDescription } from "./cms-integration-description";

type TrackedAgencyIntegrationLinkProps = {
  agencyId: string;
  linkedIntegrationId: string | null | undefined;
  disabled?: boolean;
};

export function TrackedAgencyIntegrationLink({
  agencyId,
  linkedIntegrationId,
  disabled = false,
}: TrackedAgencyIntegrationLinkProps) {
  const unlinkConfirm = useOverlayState();
  const { data: connections = [], isPending: connectionsPending } =
    useUserIntegrationConnections();
  const linkIntegration = useLinkIntegration();
  const unlinkIntegration = useUnlinkIntegration();

  const linkableConnections = useMemo(
    () => getLinkableConnections(connections),
    [connections],
  );

  const linkedConnection = useMemo(
    () => linkableConnections.find((connection) => connection.id === linkedIntegrationId),
    [linkableConnections, linkedIntegrationId],
  );

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    linkedIntegrationId ?? null,
  );

  useEffect(() => {
    setSelectedConnectionId(linkedIntegrationId ?? null);
  }, [linkedIntegrationId]);

  const isPending = connectionsPending || linkIntegration.isPending || unlinkIntegration.isPending;
  const connectionOptions = linkableConnections.map((connection) => ({
    id: connection.id,
    label: getIntegrationConnectionLabel(connection),
  }));

  const handleLink = () => {
    if (!selectedConnectionId || selectedConnectionId === linkedIntegrationId) {
      return;
    }

    linkIntegration.mutate({
      agencyId,
      payload: { user_integration_id: selectedConnectionId },
    });
  };

  const handleUnlink = async () => {
    await unlinkIntegration.mutateAsync(agencyId);
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <CmsIntegrationDescription context="agency" />

      {connectionsPending ? (
        <Skeleton className="h-10 w-full rounded-lg" />
      ) : linkableConnections.length === 0 ? (
        <p className="text-sm text-muted">
          Connect {getIntegrationTypeLabel(IntegrationTypes.ESTATEWEB)} on{" "}
          <Link to={Routes.dashboard.integrations} className="text-accent hover:underline">
            Integrations
          </Link>{" "}
          before linking it here.
        </p>
      ) : linkedConnection ? (
        <div className="flex flex-col gap-3 rounded-lg bg-surface-secondary p-3">
          <CredentialStatusIndicators
            hasApiKey={linkedConnection.has_api_key_secret}
            hasPassword={linkedConnection.has_password}
            hasConfig={linkedConnection.has_config}
            email={linkedConnection.email}
            username={linkedConnection.username}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-foreground">
              Linked to {getIntegrationConnectionLabel(linkedConnection)}
            </p>
            <ActionButtonWithPending
              size="sm"
              variant="danger"
              onPress={unlinkConfirm.open}
              isDisabled={disabled || isPending}
            >
              Unlink
            </ActionButtonWithPending>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Select
            selectedKey={selectedConnectionId ?? undefined}
            isDisabled={disabled || isPending}
            onSelectionChange={(key) => setSelectedConnectionId(String(key))}
            className="w-full"
          >
            <Label>Connection</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {connectionOptions.map((option) => (
                  <ListBox.Item key={option.id} id={option.id}>
                    {option.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <div className="flex items-center justify-between gap-2">
            <Link
              to={Routes.dashboard.integrations}
              className="text-xs text-accent hover:underline"
            >
              Manage connections
            </Link>
            <ActionButtonWithPending
              size="sm"
              onPress={handleLink}
              isDisabled={disabled || isPending || !selectedConnectionId}
              isPending={linkIntegration.isPending}
            >
              Link integration
            </ActionButtonWithPending>
          </div>
        </div>
      )}

      <ConfirmationDialog
        state={unlinkConfirm}
        title="Unlink CMS integration?"
        description="This tracked agency will no longer be associated with that integration connection."
        confirmLabel="Unlink"
        onConfirm={handleUnlink}
        isPending={unlinkIntegration.isPending}
      />
    </div>
  );
}
