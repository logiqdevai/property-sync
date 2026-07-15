import { useEffect, useMemo, useState } from "react";
import { Form, Modal, useOverlayState } from "@heroui/react";
import { useForm } from "react-hook-form";
import { Skeleton } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { AvailableIntegrationTarget } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import type { MaskedUserIntegrationConnection } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import {
  useAvailableIntegrationTargets,
  useConnectIntegration,
  useDisconnectIntegration,
  useUpdateUserIntegrationConnection,
  useUpdateUserIntegrationConnectionDefault,
  useUpdateUserIntegrationConnectionStatus,
  useUserIntegrationConnections,
} from "@/features/user-integrations/hooks/use-user-integrations";
import {
  CredentialStatusIndicators,
  IntegrationCredentialFields,
} from "./components/integration-credential-fields";
import {
  getConnectCredentialsSchema,
  getEditFormDefaultValues,
  mapConnectFormToPayload,
  mapEditFormToPayload,
  type ConnectCredentialsFormValues,
} from "@/features/user-integrations/validation-schemas/user-integrations.schema";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integration-type-form.options";
import { getIntegrationTypeDescription } from "@/config/constants/dropdowns/integration-type-description.options";
import { getAuthTypeLabel } from "@/config/constants/dropdowns/auth-type-form.options";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { LinkConnectionToAgencyModal } from "./components/link-connection-to-agency-modal";
import { AllConnectionsModal } from "./components/all-connections-modal";
import { IntegrationConnectionItem } from "./components/integration-connection-item";
import { cn } from "@/lib/utils";

const VIEW_ONLY_INTEGRATION_MESSAGE =
  "View only — changes are disabled for this integration";

function IntegrationsCardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}

function TargetCard({
  target,
  connections,
  onConnect,
  onEdit,
  onDisconnectRequest,
  onToggleActive,
  onSetDefault,
  onShowAll,
  isPending,
}: {
  target: AvailableIntegrationTarget;
  connections: MaskedUserIntegrationConnection[];
  onConnect: (target: AvailableIntegrationTarget) => void;
  onEdit: (connection: MaskedUserIntegrationConnection) => void;
  onDisconnectRequest: (connection: MaskedUserIntegrationConnection) => void;
  onToggleActive: (connection: MaskedUserIntegrationConnection, next: boolean) => void;
  onSetDefault: (connection: MaskedUserIntegrationConnection) => void;
  onShowAll: (target: AvailableIntegrationTarget) => void;
  isPending: boolean;
}) {
  const targetConnections = connections.filter(
    (connection) => connection.integration_target_id === target.id,
  );
  const isReadOnly = !target.is_enabled;

  return (
    <article className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {getIntegrationTypeLabel(target.integration_type)}
          </h2>
          <p className="text-sm text-muted">
            {getIntegrationTypeDescription(target.integration_type)}
          </p>
          <p className="text-xs text-muted">{getAuthTypeLabel(target.auth_type)}</p>
          {target.base_url && <p className="text-xs text-muted truncate">{target.base_url}</p>}
        </div>
        {(!target.is_connected || target.allow_multiple) ? (
          <ActionButtonWithPending size="sm" onPress={() => onConnect(target)} isDisabled={isPending}>
            Connect
          </ActionButtonWithPending>
        ) : null}
      </div>

      {targetConnections.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {target.allow_multiple ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {targetConnections.length} connected account{targetConnections.length === 1 ? "" : "s"}
              </p>
              <ActionButtonWithPending
                size="sm"
                variant="secondary"
                onPress={() => onShowAll(target)}
                isDisabled={isPending}
              >
                Show all
              </ActionButtonWithPending>
            </div>
          ) : null}
          <div
            className={cn(
              "flex flex-col gap-3",
              target.allow_multiple && "max-h-72 min-h-0 overflow-y-auto pr-1",
            )}
          >
            {targetConnections.map((connection) => (
              <IntegrationConnectionItem
                key={connection.id}
                connection={connection}
                target={target}
                isReadOnly={isReadOnly}
                isPending={isPending}
                onEdit={onEdit}
                onDisconnectRequest={onDisconnectRequest}
                onToggleActive={onToggleActive}
                onSetDefault={onSetDefault}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default function DashboardIntegrationsPage() {
  const connectModal = useOverlayState();
  const editModal = useOverlayState();
  const disconnectConfirm = useOverlayState();
  const linkAgencyModal = useOverlayState();
  const showAllModal = useOverlayState();

  const [selectedTarget, setSelectedTarget] = useState<AvailableIntegrationTarget | null>(null);
  const [showAllTarget, setShowAllTarget] = useState<AvailableIntegrationTarget | null>(null);
  const [editingConnection, setEditingConnection] = useState<MaskedUserIntegrationConnection | null>(
    null,
  );
  const [disconnectingConnection, setDisconnectingConnection] =
    useState<MaskedUserIntegrationConnection | null>(null);
  const [pendingLinkConnectionId, setPendingLinkConnectionId] = useState<string | null>(null);

  const { data: targets = [], isPending: targetsPending } = useAvailableIntegrationTargets();
  const { data: connections = [], isPending: connectionsPending } = useUserIntegrationConnections();

  const connectIntegration = useConnectIntegration();
  const updateConnection = useUpdateUserIntegrationConnection();
  const updateStatus = useUpdateUserIntegrationConnectionStatus();
  const updateDefault = useUpdateUserIntegrationConnectionDefault();
  const disconnectIntegration = useDisconnectIntegration();

  const connectForm = useForm<ConnectCredentialsFormValues>();
  const editForm = useForm<ConnectCredentialsFormValues>();

  const isPending =
    connectIntegration.isPending ||
    updateConnection.isPending ||
    updateStatus.isPending ||
    updateDefault.isPending ||
    disconnectIntegration.isPending;

  const sortedTargets = useMemo(
    () =>
      [...targets].sort((a, b) =>
        getIntegrationTypeLabel(a.integration_type).localeCompare(
          getIntegrationTypeLabel(b.integration_type),
        ),
      ),
    [targets],
  );

  useEffect(() => {
    if (!selectedTarget) {
      return;
    }
    connectForm.reset({ auth_type: selectedTarget.auth_type } as ConnectCredentialsFormValues);
  }, [selectedTarget, connectForm]);

  useEffect(() => {
    if (!editingConnection) {
      return;
    }
    editForm.reset(
      getEditFormDefaultValues(editingConnection.integration_target.auth_type, {
        email: editingConnection.email,
        username: editingConnection.username,
        password: editingConnection.password,
        api_key_secret: editingConnection.api_key_secret,
      }),
    );
  }, [editingConnection, editForm]);

  const openConnect = (target: AvailableIntegrationTarget) => {
    setSelectedTarget(target);
    connectModal.open();
  };

  const openEdit = (connection: MaskedUserIntegrationConnection) => {
    setEditingConnection(connection);
    editModal.open();
  };

  const openDisconnect = (connection: MaskedUserIntegrationConnection) => {
    setDisconnectingConnection(connection);
    disconnectConfirm.open();
  };

  const openShowAll = (target: AvailableIntegrationTarget) => {
    setShowAllTarget(target);
    showAllModal.open();
  };

  const showAllConnections = useMemo(() => {
    if (!showAllTarget) {
      return [];
    }

    return connections.filter(
      (connection) => connection.integration_target_id === showAllTarget.id,
    );
  }, [connections, showAllTarget]);

  const submitConnect = connectForm.handleSubmit((values) => {
    if (!selectedTarget) {
      return;
    }

    const parsed = getConnectCredentialsSchema(selectedTarget.auth_type).parse({
      ...values,
      auth_type: selectedTarget.auth_type,
    });

    connectIntegration.mutate(mapConnectFormToPayload(selectedTarget.id, parsed), {
      onSuccess: (connection) => {
        connectModal.close();
        setSelectedTarget(null);

        if (selectedTarget.integration_type === IntegrationTypes.ESTATEWEB) {
          setPendingLinkConnectionId(connection.id);
          linkAgencyModal.open();
        }
      },
    });
  });

  const submitEdit = editForm.handleSubmit((values) => {
    if (!editingConnection) {
      return;
    }

    updateConnection.mutate(
      {
        id: editingConnection.id,
        payload: mapEditFormToPayload({
          ...values,
          auth_type: editingConnection.integration_target.auth_type,
        }),
      },
      {
        onSuccess: () => {
          editModal.close();
          setEditingConnection(null);
        },
      },
    );
  });

  const handleDisconnect = async () => {
    if (!disconnectingConnection) {
      return;
    }

    await disconnectIntegration.mutateAsync(disconnectingConnection.id);
    setDisconnectingConnection(null);
  };

  const loading = targetsPending || connectionsPending;
  const isConnectReadOnly = selectedTarget ? !selectedTarget.is_enabled : false;
  const isEditReadOnly = editingConnection ? !editingConnection.integration_target.is_enabled : false;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Integrations</p>
        <p className="text-sm text-muted">
          Connect CMS destinations and AI providers using your own credentials.
        </p>
      </div>

      {loading ? (
        <IntegrationsCardSkeleton />
      ) : sortedTargets.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No integration targets are available right now.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedTargets.map((target) => (
            <TargetCard
              key={target.id}
              target={target}
              connections={connections}
              onConnect={openConnect}
              onEdit={openEdit}
              onDisconnectRequest={openDisconnect}
              onToggleActive={(connection, next) =>
                updateStatus.mutate({ id: connection.id, isActive: next })
              }
              onSetDefault={(connection) =>
                updateDefault.mutate({ id: connection.id, isDefault: true })
              }
              onShowAll={openShowAll}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      <Modal state={connectModal}>
        <Modal.Backdrop isDismissable={!connectIntegration.isPending}>
          <Modal.Container>
            <Modal.Dialog className="max-w-lg">
              <Modal.Header>
                <Modal.Heading>
                  Connect{" "}
                  {selectedTarget
                    ? getIntegrationTypeLabel(selectedTarget.integration_type)
                    : "integration"}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {selectedTarget && (
                  <Form onSubmit={submitConnect} className="grid gap-4">
                    {isConnectReadOnly && (
                      <p className="text-sm text-muted">{VIEW_ONLY_INTEGRATION_MESSAGE}</p>
                    )}
                    <IntegrationCredentialFields
                      authType={selectedTarget.auth_type}
                      register={connectForm.register}
                      errors={connectForm.formState.errors}
                      isDisabled={isConnectReadOnly}
                    />
                    <div className="flex justify-end gap-2">
                      <ActionButtonWithPending
                        type="button"
                        variant="secondary"
                        onPress={connectModal.close}
                        isDisabled={connectIntegration.isPending}
                      >
                        Cancel
                      </ActionButtonWithPending>
                      <ActionButtonWithPending
                        type="submit"
                        isPending={connectIntegration.isPending}
                        isDisabled={isConnectReadOnly}
                      >
                        Connect
                      </ActionButtonWithPending>
                    </div>
                  </Form>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={editModal}>
        <Modal.Backdrop isDismissable={!updateConnection.isPending}>
          <Modal.Container>
            <Modal.Dialog className="max-w-lg">
              <Modal.Header>
                <Modal.Heading>Edit integration credentials</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {editingConnection && (
                  <Form onSubmit={submitEdit} className="grid gap-4">
                    {isEditReadOnly && (
                      <p className="text-sm text-muted">{VIEW_ONLY_INTEGRATION_MESSAGE}</p>
                    )}
                    <CredentialStatusIndicators
                      hasApiKey={editingConnection.has_api_key_secret}
                      hasPassword={editingConnection.has_password}
                      hasConfig={editingConnection.has_config}
                      email={editingConnection.email}
                      username={editingConnection.username}
                    />
                    <IntegrationCredentialFields
                      authType={editingConnection.integration_target.auth_type}
                      register={editForm.register}
                      watch={editForm.watch}
                      errors={editForm.formState.errors}
                      mode="edit"
                      isDisabled={isEditReadOnly}
                      maskedCredentials={{
                        email: editingConnection.email,
                        username: editingConnection.username,
                        password: editingConnection.password,
                        api_key_secret: editingConnection.api_key_secret,
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <ActionButtonWithPending
                        type="button"
                        variant="secondary"
                        onPress={editModal.close}
                        isDisabled={updateConnection.isPending}
                      >
                        Cancel
                      </ActionButtonWithPending>
                      <ActionButtonWithPending
                        type="submit"
                        isPending={updateConnection.isPending}
                        isDisabled={isEditReadOnly}
                      >
                        Save
                      </ActionButtonWithPending>
                    </div>
                  </Form>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmationDialog
        state={disconnectConfirm}
        title="Disconnect integration?"
        description="You can reconnect later with new credentials."
        confirmLabel="Disconnect"
        onConfirm={handleDisconnect}
        isPending={disconnectIntegration.isPending}
      />

      <LinkConnectionToAgencyModal
        state={linkAgencyModal}
        connectionId={pendingLinkConnectionId}
        onClose={() => setPendingLinkConnectionId(null)}
      />

      <AllConnectionsModal
        state={showAllModal}
        target={showAllTarget}
        connections={showAllConnections}
        isPending={isPending}
        onEdit={openEdit}
        onDisconnectRequest={openDisconnect}
        onToggleActive={(connection, next) =>
          updateStatus.mutate({ id: connection.id, isActive: next })
        }
        onSetDefault={(connection) =>
          updateDefault.mutate({ id: connection.id, isDefault: true })
        }
      />
    </div>
  );
}
