import { useEffect, useMemo, useState } from "react";
import { Form, Modal, Switch, useOverlayState } from "@heroui/react";
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
  useUpdateUserIntegrationConnectionStatus,
  useUserIntegrationConnections,
} from "@/features/user-integrations/hooks/use-user-integrations";
import {
  CredentialStatusIndicators,
  IntegrationCredentialFields,
} from "./components/integration-credential-fields";
import {
  getConnectCredentialsSchema,
  mapConnectFormToPayload,
  mapEditFormToPayload,
  type ConnectCredentialsFormValues,
} from "@/features/user-integrations/validation-schemas/user-integrations.schema";

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
  isPending,
}: {
  target: AvailableIntegrationTarget;
  connections: MaskedUserIntegrationConnection[];
  onConnect: (target: AvailableIntegrationTarget) => void;
  onEdit: (connection: MaskedUserIntegrationConnection) => void;
  onDisconnectRequest: (connection: MaskedUserIntegrationConnection) => void;
  onToggleActive: (connection: MaskedUserIntegrationConnection, next: boolean) => void;
  isPending: boolean;
}) {
  const targetConnections = connections.filter(
    (connection) => connection.integration_target_id === target.id,
  );

  return (
    <article className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{target.integration_type}</h2>
          <p className="text-sm text-muted">{target.auth_type}</p>
          {target.base_url && <p className="text-xs text-muted truncate">{target.base_url}</p>}
        </div>
        {!target.is_connected || target.allow_multiple ? (
          <ActionButtonWithPending size="sm" onPress={() => onConnect(target)} isDisabled={isPending}>
            Connect
          </ActionButtonWithPending>
        ) : null}
      </div>

      {targetConnections.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {targetConnections.map((connection) => (
            <div key={connection.id} className="flex flex-col gap-2 rounded-lg bg-surface-secondary p-3">
              <CredentialStatusIndicators
                hasApiKey={connection.has_api_key_secret}
                hasPassword={connection.has_password}
                hasConfig={connection.has_config}
                email={connection.email}
                username={connection.username}
              />
              <div className="flex items-center justify-between gap-2">
                <Switch
                  isSelected={connection.is_active}
                  isDisabled={isPending}
                  onChange={(next) => onToggleActive(connection, next)}
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>{connection.is_active ? "Active" : "Disabled"}</Switch.Content>
                </Switch>
                <div className="flex gap-2">
                  <ActionButtonWithPending
                    size="sm"
                    variant="secondary"
                    onPress={() => onEdit(connection)}
                    isDisabled={isPending}
                  >
                    Edit
                  </ActionButtonWithPending>
                  <ActionButtonWithPending
                    size="sm"
                    variant="danger"
                    onPress={() => onDisconnectRequest(connection)}
                    isDisabled={isPending}
                  >
                    Disconnect
                  </ActionButtonWithPending>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export default function DashboardIntegrationsPage() {
  const connectModal = useOverlayState();
  const editModal = useOverlayState();
  const disconnectConfirm = useOverlayState();

  const [selectedTarget, setSelectedTarget] = useState<AvailableIntegrationTarget | null>(null);
  const [editingConnection, setEditingConnection] = useState<MaskedUserIntegrationConnection | null>(
    null,
  );
  const [disconnectingConnection, setDisconnectingConnection] =
    useState<MaskedUserIntegrationConnection | null>(null);

  const { data: targets = [], isPending: targetsPending } = useAvailableIntegrationTargets();
  const { data: connections = [], isPending: connectionsPending } = useUserIntegrationConnections();

  const connectIntegration = useConnectIntegration();
  const updateConnection = useUpdateUserIntegrationConnection();
  const updateStatus = useUpdateUserIntegrationConnectionStatus();
  const disconnectIntegration = useDisconnectIntegration();

  const connectForm = useForm<ConnectCredentialsFormValues>();
  const editForm = useForm<ConnectCredentialsFormValues>();

  const isPending =
    connectIntegration.isPending ||
    updateConnection.isPending ||
    updateStatus.isPending ||
    disconnectIntegration.isPending;

  const sortedTargets = useMemo(
    () => [...targets].sort((a, b) => a.integration_type.localeCompare(b.integration_type)),
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
    editForm.reset({
      auth_type: editingConnection.integration_target.auth_type,
    } as ConnectCredentialsFormValues);
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

  const submitConnect = connectForm.handleSubmit((values) => {
    if (!selectedTarget) {
      return;
    }

    const parsed = getConnectCredentialsSchema(selectedTarget.auth_type).parse({
      ...values,
      auth_type: selectedTarget.auth_type,
    });

    connectIntegration.mutate(mapConnectFormToPayload(selectedTarget.id, parsed), {
      onSuccess: () => {
        connectModal.close();
        setSelectedTarget(null);
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
                  Connect {selectedTarget?.integration_type ?? "integration"}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {selectedTarget && (
                  <Form onSubmit={submitConnect} className="grid gap-4">
                    <IntegrationCredentialFields
                      authType={selectedTarget.auth_type}
                      register={connectForm.register}
                      errors={connectForm.formState.errors}
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
                      <ActionButtonWithPending type="submit" isPending={connectIntegration.isPending}>
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
                      errors={editForm.formState.errors}
                      mode="edit"
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
                      <ActionButtonWithPending type="submit" isPending={updateConnection.isPending}>
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
    </div>
  );
}
