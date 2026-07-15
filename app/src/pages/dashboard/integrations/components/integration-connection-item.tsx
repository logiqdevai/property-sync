import { Chip, Switch } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { RoleGate } from "@/components/providers/role-gate";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import type { AvailableIntegrationTarget } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import type { MaskedUserIntegrationConnection } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import { CredentialStatusIndicators } from "./integration-credential-fields";

type IntegrationConnectionItemProps = {
  connection: MaskedUserIntegrationConnection;
  target: AvailableIntegrationTarget;
  isReadOnly: boolean;
  isPending: boolean;
  onEdit: (connection: MaskedUserIntegrationConnection) => void;
  onDisconnectRequest: (connection: MaskedUserIntegrationConnection) => void;
  onToggleActive: (connection: MaskedUserIntegrationConnection, next: boolean) => void;
  onSetDefault: (connection: MaskedUserIntegrationConnection) => void;
};

export function IntegrationConnectionItem({
  connection,
  target,
  isReadOnly,
  isPending,
  onEdit,
  onDisconnectRequest,
  onToggleActive,
  onSetDefault,
}: IntegrationConnectionItemProps) {
  const activeSwitch = (
    <Switch
      isSelected={connection.is_active}
      isDisabled={isReadOnly || isPending}
      onChange={(next) => onToggleActive(connection, next)}
    >
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.Content>{connection.is_active ? "Active" : "Disabled"}</Switch.Content>
    </Switch>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-secondary p-3">
      <CredentialStatusIndicators
        hasApiKey={connection.has_api_key_secret}
        hasWebhookKey={connection.has_webhook_key}
        hasPassword={connection.has_password}
        hasConfig={connection.has_config}
        email={connection.email}
        username={connection.username}
      />
      {target.allow_multiple && connection.is_default ? (
        <Chip size="sm" variant="soft" color="accent">
          <Chip.Label>Default</Chip.Label>
        </Chip>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {target.integration_type === IntegrationTypes.ESTATEWEB ? (
          <RoleGate roles={[RoleTypes.ADMIN]}>{activeSwitch}</RoleGate>
        ) : (
          activeSwitch
        )}
        <div className="flex flex-wrap gap-2">
          {target.allow_multiple && !connection.is_default ? (
            <RoleGate roles={[RoleTypes.ADMIN]}>
              <ActionButtonWithPending
                size="sm"
                variant="secondary"
                onPress={() => onSetDefault(connection)}
                isDisabled={isReadOnly || isPending}
              >
                Set as default
              </ActionButtonWithPending>
            </RoleGate>
          ) : null}
          <ActionButtonWithPending
            size="sm"
            variant="secondary"
            onPress={() => onEdit(connection)}
            isDisabled={isPending}
          >
            {isReadOnly ? "View" : "Edit"}
          </ActionButtonWithPending>
          {!isReadOnly ? (
            <ActionButtonWithPending
              size="sm"
              variant="danger"
              onPress={() => onDisconnectRequest(connection)}
              isDisabled={isPending}
            >
              Disconnect
            </ActionButtonWithPending>
          ) : null}
        </div>
      </div>
    </div>
  );
}
