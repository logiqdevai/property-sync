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

function parseClientId(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value < 1) {
    return null;
  }
  return value;
}

type TrackedAgencyIntegrationLinkProps = {
  agencyId: string;
  linkedIntegrationId: string | null | undefined;
  linkedClientId?: number | null;
  disabled?: boolean;
  className?: string;
  hideHeading?: boolean;
};

export function TrackedAgencyIntegrationLink({
  agencyId,
  linkedIntegrationId,
  linkedClientId = null,
  disabled = false,
  className = "flex flex-col gap-3 border-t border-border pt-4",
  hideHeading = false,
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
  const [clientIdInput, setClientIdInput] = useState(
    linkedClientId != null ? String(linkedClientId) : "",
  );

  useEffect(() => {
    setSelectedConnectionId(linkedIntegrationId ?? null);
  }, [linkedIntegrationId]);

  useEffect(() => {
    setClientIdInput(linkedClientId != null ? String(linkedClientId) : "");
  }, [linkedClientId]);

  const isPending = connectionsPending || linkIntegration.isPending || unlinkIntegration.isPending;
  const connectionOptions = linkableConnections.map((connection) => ({
    id: connection.id,
    label: getIntegrationConnectionLabel(connection),
  }));

  const parsedClientId = parseClientId(clientIdInput);
  const clientIdInputValid =
    clientIdInput.trim() === "" || parsedClientId !== null;
  const clientIdDirty =
    clientIdInputValid && parsedClientId !== (linkedClientId ?? null);

  const handleLink = () => {
    if (!selectedConnectionId || selectedConnectionId === linkedIntegrationId) {
      return;
    }

    linkIntegration.mutate({
      agencyId,
      payload: {
        user_integration_id: selectedConnectionId,
        integration_client_id: parsedClientId,
      },
    });
  };

  const handleSaveClientId = () => {
    if (!linkedIntegrationId || !clientIdDirty) {
      return;
    }

    linkIntegration.mutate({
      agencyId,
      payload: {
        user_integration_id: linkedIntegrationId,
        integration_client_id: parsedClientId,
      },
    });
  };

  const handleUnlink = async () => {
    await unlinkIntegration.mutateAsync(agencyId);
  };

  const clientIdField = (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">CRM client ID</span>
      <span className="text-xs text-muted">
        Optional. EstateWeb contact id used for property notes (last name).
      </span>
      <input
        type="number"
        min={1}
        className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2"
        value={clientIdInput}
        disabled={disabled || isPending}
        placeholder="e.g. 45831"
        onChange={(e) => setClientIdInput(e.target.value)}
      />
    </label>
  );

  return (
    <div className={className}>
      <CmsIntegrationDescription context="agency" hideTitle={hideHeading} />

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
        <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface-secondary p-3">
          <CredentialStatusIndicators
            hasApiKey={linkedConnection.has_api_key_secret}
            hasPassword={linkedConnection.has_password}
            hasConfig={linkedConnection.has_config}
            email={linkedConnection.email}
            username={linkedConnection.username}
          />
          <p className="min-w-0 break-words text-sm text-foreground">
            Linked to {getIntegrationConnectionLabel(linkedConnection)}
          </p>
          {clientIdField}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <ActionButtonWithPending
              size="sm"
              onPress={handleSaveClientId}
              isDisabled={disabled || isPending || !clientIdDirty}
              isPending={linkIntegration.isPending}
              className="shrink-0 self-start sm:self-auto"
            >
              Save client ID
            </ActionButtonWithPending>
            <ActionButtonWithPending
              size="sm"
              variant="danger"
              onPress={unlinkConfirm.open}
              isDisabled={disabled || isPending}
              className="shrink-0 self-start sm:self-auto"
            >
              Unlink
            </ActionButtonWithPending>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <Select
            selectedKey={selectedConnectionId ?? undefined}
            isDisabled={disabled || isPending}
            onSelectionChange={(key) => setSelectedConnectionId(String(key))}
            className="w-full min-w-0"
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

          {clientIdField}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
              className="shrink-0 self-start sm:self-auto"
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
